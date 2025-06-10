import { TwilioUtils } from './utils/twilioUtils.js';
import { FirestoreUtils } from './utils/firestoreUtils.js';
import { PromptResolver } from './utils/promptResolver.js';

export async function initiateVoiceCall(req, res) {
  try {
    const { to, agent_id = process.env.DEFAULT_AGENT_ID, context = {} } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Missing required field: to' });
    }

    // Get or create contact
    let contact = await FirestoreUtils.getContact(to);
    if (!contact) {
      contact = await FirestoreUtils.createContact(to, {
        phone_number: to,
        platform: 'voice',
        agent_id
      });
    }

    // Initiate the call
    const call = await TwilioUtils.makeCall(to);

    // Log the event
    await FirestoreUtils.logEvent({
      type: 'voice_call',
      status: 'initiated',
      contact_id: to,
      metadata: {
        call_sid: call.sid,
        agent_id
      }
    });

    // Update contact
    await FirestoreUtils.updateContact(to, {
      status: 'contacted',
      last_call_sid: call.sid
    });

    res.status(200).json({
      success: true,
      call_sid: call.sid,
      status: call.status
    });

  } catch (error) {
    console.error('Voice call initiation error:', error);
    
    // Log failed event
    await FirestoreUtils.logEvent({
      type: 'voice_call',
      status: 'failed',
      contact_id: req.body.to,
      metadata: { error: error.message }
    });

    res.status(500).json({ error: 'Failed to initiate call' });
  }
}