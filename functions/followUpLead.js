import { FirestoreUtils } from './utils/firestoreUtils.js';
import { PromptResolver } from './utils/promptResolver.js';
import { dispatchMessage } from './dispatchMessage.js';

export async function followUpLead(req, res) {
  try {
    const { 
      contact_id, 
      delay_hours = 24, 
      message_template = 'default_followup',
      context = {} 
    } = req.body;

    if (!contact_id) {
      return res.status(400).json({ error: 'Missing required field: contact_id' });
    }

    // Get contact information
    const contact = await FirestoreUtils.getContact(contact_id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Calculate follow-up time
    const followUpTime = new Date();
    followUpTime.setHours(followUpTime.getHours() + delay_hours);

    // Create follow-up record
    const followUpData = {
      contact_id,
      scheduled_time: followUpTime.toISOString(),
      message_template,
      context,
      status: 'scheduled',
      created_at: new Date().toISOString(),
      agent_id: contact.agent_id || process.env.DEFAULT_AGENT_ID
    };

    // Store in Firestore
    const followUpRef = await FirestoreUtils.db.collection('follow_ups').add(followUpData);

    // Update contact record
    await FirestoreUtils.updateContact(contact_id, {
      next_followup: followUpTime.toISOString(),
      followup_count: (contact.followup_count || 0) + 1
    });

    // Log the event
    await FirestoreUtils.logEvent({
      type: 'follow_up_scheduled',
      status: 'created',
      contact_id,
      metadata: {
        followup_id: followUpRef.id,
        scheduled_time: followUpTime.toISOString(),
        delay_hours
      }
    });

    res.status(200).json({
      success: true,
      followup_id: followUpRef.id,
      scheduled_time: followUpTime.toISOString(),
      message: 'Follow-up scheduled successfully'
    });

  } catch (error) {
    console.error('Follow-up scheduling error:', error);
    res.status(500).json({ error: 'Failed to schedule follow-up' });
  }
}

// Function to process scheduled follow-ups (would be called by a cron job)
export async function processScheduledFollowUps() {
  try {
    const now = new Date();
    const followUpsQuery = FirestoreUtils.db
      .collection('follow_ups')
      .where('status', '==', 'scheduled')
      .where('scheduled_time', '<=', now.toISOString())
      .limit(50);

    const snapshot = await followUpsQuery.get();
    
    if (snapshot.empty) {
      return;
    }

    for (const doc of snapshot.docs) {
      const followUp = doc.data();
      await executeFollowUp(doc.id, followUp);
    }

  } catch (error) {
    console.error('Error processing scheduled follow-ups:', error);
  }
}

async function executeFollowUp(followUpId, followUpData) {
  try {
    const { contact_id, message_template, context, agent_id } = followUpData;

    // Get contact information
    const contact = await FirestoreUtils.getContact(contact_id);
    if (!contact) {
      console.error(`Contact ${contact_id} not found for follow-up ${followUpId}`);
      return;
    }

    // Skip if contact has been converted or escalated
    if (contact.status === 'converted' || contact.escalation) {
      await updateFollowUpStatus(followUpId, 'skipped', 'Contact already converted or escalated');
      return;
    }

    // Generate follow-up message
    const message = await generateFollowUpMessage(agent_id, message_template, {
      ...context,
      contact_name: contact.name || 'there',
      last_interaction: contact.last_interaction
    });

    // Send the follow-up message
    await dispatchMessage({
      body: {
        to: contact_id,
        message,
        platform: contact.platform || 'whatsapp'
      }
    }, {
      status: (code) => ({
        json: (data) => console.log(`Follow-up sent: ${code}`)
      })
    });

    // Update follow-up status
    await updateFollowUpStatus(followUpId, 'sent', 'Follow-up message sent successfully');

    // Log the event
    await FirestoreUtils.logEvent({
      type: 'follow_up_sent',
      status: 'success',
      contact_id,
      metadata: {
        followup_id: followUpId,
        message_template
      }
    });

  } catch (error) {
    console.error(`Error executing follow-up ${followUpId}:`, error);
    await updateFollowUpStatus(followUpId, 'failed', error.message);
  }
}

async function generateFollowUpMessage(agentId, template, context) {
  try {
    // Get template from prompt resolver
    const templates = await PromptResolver.getTemplate(agentId, 'followup_templates', context);
    
    if (templates && templates[template]) {
      return templates[template];
    }

    // Default follow-up messages
    const defaultTemplates = {
      default_followup: `Hi ${context.contact_name}! I wanted to follow up on our previous conversation. Do you have any questions about how ICUPA Malta can help with your business needs?`,
      qualification_followup: `Hello again! I was wondering if you've had a chance to think about the business solutions we discussed. I'd be happy to answer any questions you might have.`,
      consultation_followup: `Hi ${context.contact_name}! Just following up to see if you'd like to schedule that consultation we talked about. I have some time slots available this week.`
    };

    return defaultTemplates[template] || defaultTemplates.default_followup;

  } catch (error) {
    console.error('Error generating follow-up message:', error);
    return `Hi! Just following up on our previous conversation. Is there anything I can help you with today?`;
  }
}

async function updateFollowUpStatus(followUpId, status, notes = '') {
  try {
    await FirestoreUtils.db.collection('follow_ups').doc(followUpId).update({
      status,
      executed_at: new Date().toISOString(),
      notes
    });
  } catch (error) {
    console.error(`Error updating follow-up status ${followUpId}:`, error);
  }
}

// Export the cron job function
export { processScheduledFollowUps as cronProcessFollowUps };