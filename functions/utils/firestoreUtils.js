import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

const db = admin.firestore();

export class FirestoreUtils {
  // Contact management
  static async getContact(phoneNumber) {
    try {
      const doc = await db.collection('contacts').doc(phoneNumber).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } catch (error) {
      console.error('Error getting contact:', error);
      throw error;
    }
  }

  static async createContact(phoneNumber, data) {
    try {
      const contactData = {
        agent_id: process.env.DEFAULT_AGENT_ID,
        status: 'new',
        language: 'english',
        last_interaction: admin.firestore.Timestamp.now(),
        messages: [],
        escalation: false,
        conversion_date: null,
        created_at: admin.firestore.Timestamp.now(),
        ...data
      };
      
      await db.collection('contacts').doc(phoneNumber).set(contactData);
      return { id: phoneNumber, ...contactData };
    } catch (error) {
      console.error('Error creating contact:', error);
      throw error;
    }
  }

  static async updateContact(phoneNumber, data) {
    try {
      await db.collection('contacts').doc(phoneNumber).update({
        ...data,
        last_interaction: admin.firestore.Timestamp.now()
      });
    } catch (error) {
      console.error('Error updating contact:', error);
      throw error;
    }
  }

  static async addMessage(phoneNumber, message) {
    try {
      const messageData = {
        from: message.from,
        text: message.text,
        timestamp: admin.firestore.Timestamp.now(),
        message_id: message.id || null
      };

      await db.collection('contacts').doc(phoneNumber).update({
        messages: admin.firestore.FieldValue.arrayUnion(messageData),
        last_interaction: admin.firestore.Timestamp.now()
      });
    } catch (error) {
      console.error('Error adding message:', error);
      throw error;
    }
  }

  // Event logging
  static async logEvent(eventData) {
    try {
      const event = {
        type: eventData.type,
        status: eventData.status,
        duration: eventData.duration || null,
        timestamp: admin.firestore.Timestamp.now(),
        metadata: eventData.metadata || {},
        contact_id: eventData.contact_id || null
      };

      const docRef = await db.collection('events').add(event);
      return docRef.id;
    } catch (error) {
      console.error('Error logging event:', error);
      throw error;
    }
  }

  // Agent state management
  static async getAgentState(agentId) {
    try {
      const doc = await db.collection('agent_states').doc(agentId).get();
      return doc.exists ? doc.data() : null;
    } catch (error) {
      console.error('Error getting agent state:', error);
      throw error;
    }
  }

  static async updateAgentState(agentId, state) {
    try {
      await db.collection('agent_states').doc(agentId).set(state, { merge: true });
    } catch (error) {
      console.error('Error updating agent state:', error);
      throw error;
    }
  }
}

export { db, admin };