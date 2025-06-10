import { FirestoreUtils } from './utils/firestoreUtils.js';
import { dispatchMessage } from './dispatchMessage.js';

export async function escalateLead(req, res) {
  try {
    const { contact_id, reason, priority = 'normal', agent_notes = '' } = req.body;

    if (!contact_id || !reason) {
      return res.status(400).json({ error: 'Missing required fields: contact_id, reason' });
    }

    // Get contact information
    const contact = await FirestoreUtils.getContact(contact_id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Create escalation record
    const escalationData = {
      contact_id,
      reason,
      priority,
      agent_notes,
      escalated_at: new Date().toISOString(),
      status: 'pending',
      escalated_by: 'ai_agent',
      contact_info: {
        phone: contact_id,
        language: contact.language,
        agent_id: contact.agent_id,
        last_interaction: contact.last_interaction
      }
    };

    // Store escalation in Firestore
    const escalationRef = await FirestoreUtils.db.collection('escalations').add(escalationData);

    // Update contact record
    await FirestoreUtils.updateContact(contact_id, {
      escalation: true,
      escalation_id: escalationRef.id,
      escalation_reason: reason,
      escalation_date: new Date().toISOString(),
      status: 'escalated'
    });

    // Send notification to contact
    const escalationMessage = getEscalationMessage(priority);
    
    try {
      await dispatchMessage({
        body: {
          to: contact_id,
          message: escalationMessage,
          platform: contact.platform || 'whatsapp'
        }
      }, {
        status: (code) => ({
          json: (data) => console.log(`Escalation notification sent: ${code}`)
        })
      });
    } catch (messageError) {
      console.error('Failed to send escalation message:', messageError);
    }

    // Log the escalation event
    await FirestoreUtils.logEvent({
      type: 'escalation',
      status: 'created',
      contact_id,
      metadata: {
        escalation_id: escalationRef.id,
        reason,
        priority
      }
    });

    // TODO: Send notification to human agents (email, Slack, etc.)
    await notifyHumanAgents(escalationData);

    res.status(200).json({
      success: true,
      escalation_id: escalationRef.id,
      message: 'Lead escalated successfully'
    });

  } catch (error) {
    console.error('Escalation error:', error);
    res.status(500).json({ error: 'Failed to escalate lead' });
  }
}

function getEscalationMessage(priority) {
  const messages = {
    high: 'Thank you for your inquiry! Due to the specialized nature of your request, I\'ve prioritized your case and one of our senior consultants will contact you within the next 2 hours.',
    normal: 'Thanks for your question! I\'ve connected you with a specialist who will get back to you within 24 hours with detailed information.',
    low: 'Thank you for reaching out! A member of our team will follow up with you within 2-3 business days.'
  };

  return messages[priority] || messages.normal;
}

async function notifyHumanAgents(escalationData) {
  try {
    // This would integrate with your notification system
    // Examples: email, Slack webhook, internal dashboard, etc.
    
    console.log('🚨 ESCALATION ALERT:', {
      contact: escalationData.contact_id,
      reason: escalationData.reason,
      priority: escalationData.priority,
      timestamp: escalationData.escalated_at
    });

    // Example: Send to Slack webhook (uncomment and configure)
    /*
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 Lead Escalation - Priority: ${escalationData.priority}`,
        attachments: [{
          color: escalationData.priority === 'high' ? 'danger' : 'warning',
          fields: [
            { title: 'Contact', value: escalationData.contact_id, short: true },
            { title: 'Reason', value: escalationData.reason, short: true },
            { title: 'Agent Notes', value: escalationData.agent_notes || 'None' }
          ]
        }]
      })
    });
    */

  } catch (error) {
    console.error('Failed to notify human agents:', error);
  }
}