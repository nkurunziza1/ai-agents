import { FirestoreUtils } from './utils/firestoreUtils.js';

export async function trackConversion(req, res) {
  try {
    const { 
      contact_id, 
      conversion_type, 
      value = 0, 
      currency = 'EUR',
      metadata = {} 
    } = req.body;

    if (!contact_id || !conversion_type) {
      return res.status(400).json({ error: 'Missing required fields: contact_id, conversion_type' });
    }

    // Get contact information
    const contact = await FirestoreUtils.getContact(contact_id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Create conversion record
    const conversionData = {
      contact_id,
      conversion_type,
      value,
      currency,
      converted_at: new Date().toISOString(),
      agent_id: contact.agent_id || process.env.DEFAULT_AGENT_ID,
      contact_info: {
        phone: contact_id,
        language: contact.language,
        initial_contact: contact.created_at,
        total_interactions: contact.messages?.length || 0
      },
      metadata: {
        ...metadata,
        conversion_source: determineConversionSource(contact),
        time_to_conversion: calculateTimeToConversion(contact.created_at)
      }
    };

    // Store conversion in Firestore
    const conversionRef = await FirestoreUtils.db.collection('conversions').add(conversionData);

    // Update contact record
    await FirestoreUtils.updateContact(contact_id, {
      status: 'converted',
      conversion_date: new Date().toISOString(),
      conversion_type,
      conversion_value: value,
      conversion_id: conversionRef.id
    });

    // Log the conversion event
    await FirestoreUtils.logEvent({
      type: 'conversion',
      status: 'completed',
      contact_id,
      metadata: {
        conversion_id: conversionRef.id,
        conversion_type,
        value,
        currency
      }
    });

    // Update agent performance metrics
    await updateAgentMetrics(contact.agent_id, conversion_type, value);

    res.status(200).json({
      success: true,
      conversion_id: conversionRef.id,
      message: 'Conversion tracked successfully'
    });

  } catch (error) {
    console.error('Conversion tracking error:', error);
    res.status(500).json({ error: 'Failed to track conversion' });
  }
}

function determineConversionSource(contact) {
  const messages = contact.messages || [];
  const platforms = [...new Set(messages.map(m => m.platform || 'whatsapp'))];
  
  return {
    primary_platform: contact.platform || 'whatsapp',
    platforms_used: platforms,
    first_contact_method: messages[0]?.platform || 'whatsapp',
    total_touchpoints: messages.length
  };
}

function calculateTimeToConversion(createdAt) {
  if (!createdAt) return null;
  
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now - created;
  
  return {
    total_hours: Math.round(diffMs / (1000 * 60 * 60)),
    total_days: Math.round(diffMs / (1000 * 60 * 60 * 24)),
    created_at: createdAt,
    converted_at: now.toISOString()
  };
}

async function updateAgentMetrics(agentId, conversionType, value) {
  try {
    if (!agentId) return;

    const metricsRef = FirestoreUtils.db.collection('agent_metrics').doc(agentId);
    const metricsDoc = await metricsRef.get();
    
    const currentMetrics = metricsDoc.exists ? metricsDoc.data() : {
      total_conversions: 0,
      total_conversion_value: 0,
      conversions_by_type: {},
      last_updated: null
    };

    // Update metrics
    const updatedMetrics = {
      total_conversions: currentMetrics.total_conversions + 1,
      total_conversion_value: currentMetrics.total_conversion_value + value,
      conversions_by_type: {
        ...currentMetrics.conversions_by_type,
        [conversionType]: (currentMetrics.conversions_by_type[conversionType] || 0) + 1
      },
      last_conversion: new Date().toISOString(),
      last_updated: new Date().toISOString()
    };

    await metricsRef.set(updatedMetrics, { merge: true });
 
  } catch (error) {
    console.error('Error updating agent metrics:', error);
  }
}

// Function to get conversion analytics
// export async function getConversionAnalytics(req, res) {
//   try {
//     const { 
//       agent_id, 
//       start_date, 
//       end_date, 
//       conversion_type 
//     } = req.query;

//     let query = FirestoreUtils.db.collection('conversions');

//     // Apply filters
//     if (agent_id) {
//       query = query.where('agent_id', '==', agent_id);
//     }
    
//     if (conversion_type) {
//       query = query.where('conversion_type', '==', conversion_type);
//     }

//     if (start_date) {
//       query = query.where('converted_at', '>=', start_date);
//     }

//     if (end_date) {
//       query = query.where('converted_at', '<=', end_date);
//     }

//     const snapshot = await query.orderBy('converted_at', 'desc').limit(100).get();
    
//     const conversions = [];
//     let totalValue = 0;
//     const typeBreakdown = {};

//     snapshot.forEach(doc => {
//       const data = { id: doc.id, ...doc.data() };
//       conversions.push(data);
//       totalValue += data.value || 0;
      
//       typeBreakdown[data.conversion_type] = 
//         (typeBreakdown[data.conversion_type] || 0) + 1;
//     });
