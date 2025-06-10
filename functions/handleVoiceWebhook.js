import { TwilioUtils } from './utils/twilioUtils.js';
import { FirestoreUtils } from './utils/firestoreUtils.js';
import { OpenAIUtils } from './utils/openaiUtils.js';
import { PromptResolver } from './utils/promptResolver.js';

export async function handleVoiceWebhook(req, res) {
  try {
 
    const { CallSid, From, To, CallStatus, SpeechResult, Digits } = req.body;

    // Log the call event
    await FirestoreUtils.logEvent({
      type: 'voice_call',
      status: CallStatus,
      contact_id: From,
      metadata: {
        call_sid: CallSid,
        to: To,
        speech_result: SpeechResult,
        digits: Digits
      }
    });

    let twimlResponse;

    if (CallStatus === 'in-progress' && !SpeechResult && !Digits) {
      // Initial call connection - send greeting
      twimlResponse = await handleInitialCall(From, CallSid);
    } else if (SpeechResult) {
      // Handle speech input
      twimlResponse = await handleSpeechInput(From, SpeechResult, CallSid);
    } else if (CallStatus === 'completed') {
      // Handle call completion
      await handleCallCompletion(From, CallSid);
      twimlResponse = TwilioUtils.generateTwiML('', 'hangup');
    } else {
      // Default response
      twimlResponse = TwilioUtils.generateTwiML(
        'Thank you for your time. Goodbye!', 
        'hangup'
      );
    }

    res.type('text/xml');
    res.send(twimlResponse);

  } catch (error) {
    console.error('Voice webhook error:', error);
    
    const errorTwiML = TwilioUtils.generateTwiML(
      'I apologize, but I\'m experiencing technical difficulties. Please try again later.', 
      'hangup'
    );
    
    res.type('text/xml');
    res.send(errorTwiML);
  }
}

async function handleInitialCall(phoneNumber, callSid) {
  try {
    // Get contact and agent info
    const contact = await FirestoreUtils.getContact(phoneNumber);
    const agentId = contact?.agent_id || process.env.DEFAULT_AGENT_ID;

    // Get greeting template
    const greeting = await PromptResolver.getTemplate(
      agentId, 
      'greeting_templates',
      { contact_name: contact?.name || 'there' }
    );

    const greetingMessage = greeting?.new_contact || 
      'Hello! This is your AI assistant from ICUPA Malta. How can I help you today?';

    // Store initial interaction
    await FirestoreUtils.addMessage(phoneNumber, {
      from: 'agent',
      text: greetingMessage,
      call_sid: callSid
    });

    return TwilioUtils.generateTwiML(greetingMessage, 'gather');
  } catch (error) {
    console.error('Error handling initial call:', error);
    return TwilioUtils.generateTwiML(
      'Hello! How can I help you today?', 
      'gather'
    );
  }
}

async function handleSpeechInput(phoneNumber, speechResult, callSid) {
  try {
    // Store user's speech
    await FirestoreUtils.addMessage(phoneNumber, {
      from: 'user',
      text: speechResult,
      call_sid: callSid
    });

    // Get contact and conversation history
    const contact = await FirestoreUtils.getContact(phoneNumber);
    const agentId = contact?.agent_id || process.env.DEFAULT_AGENT_ID;

    // Check if escalation is needed
    const escalationCheck = await OpenAIUtils.shouldEscalate(
      contact?.messages || [], 
      speechResult
    );

    if (escalationCheck.should_escalate) {
      const escalationMessage = 'I understand you need specialized assistance. Let me transfer you to one of our human representatives. Please hold on.';
      
      await FirestoreUtils.updateContact(phoneNumber, { 
        escalation: true,
        escalation_reason: escalationCheck.reason 
      });

      return TwilioUtils.generateTwiML(escalationMessage, 'hangup');
    }

    // Generate AI response
    const conversationHistory = (contact?.messages || [])
      .filter(msg => msg.call_sid === callSid)
      .map(msg => ({ role: msg.from === 'user' ? 'user' : 'assistant', content: msg.text }));

    const systemPrompt = await PromptResolver.buildSystemPrompt(agentId, {
      contact_name: contact?.name || 'caller',
      phone_number: phoneNumber,
      context: 'voice_call'
    });

    const response = await OpenAIUtils.generateResponse(
      [...conversationHistory, { role: 'user', content: speechResult }],
      systemPrompt + '\n\nImportant: Keep responses concise and conversational for voice interaction. Avoid complex formatting.'
    );

    // Store agent response
    await FirestoreUtils.addMessage(phoneNumber, {
      from: 'agent',
      text: response,
      call_sid: callSid
    });

    // Determine next action based on response content
    const shouldContinue = !response.toLowerCase().includes('goodbye') && 
                          !response.toLowerCase().includes('thank you for calling');

    return TwilioUtils.generateTwiML(
      response, 
      shouldContinue ? 'gather' : 'hangup'
    );

  } catch (error) {
    console.error('Error handling speech input:', error);
    return TwilioUtils.generateTwiML(
      'I apologize, could you please repeat that?', 
      'gather'
    );
  }
}

async function handleCallCompletion(phoneNumber, callSid) {
  try {
    // Update contact status
    await FirestoreUtils.updateContact(phoneNumber, {
      status: 'replied',
      last_call_completed: new Date().toISOString()
    });

    // Log completion event
    await FirestoreUtils.logEvent({
      type: 'voice_call',
      status: 'completed',
      contact_id: phoneNumber,
      metadata: { call_sid: callSid }
    });

  
  } catch (error) {
    console.error('Error handling call completion:', error);
  }
}