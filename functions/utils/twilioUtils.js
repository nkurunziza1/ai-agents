import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

export class TwilioUtils {
  static async makeCall(toNumber, fromNumber = null) {
    try {
      const call = await client.calls.create({
        to: toNumber,
        from: fromNumber || process.env.TWILIO_FROM_NUMBER,
        url: `${process.env.BASE_URL}/webhook/voice`,
        method: 'POST'
      });


      return call;
    } catch (error) {
      console.error('Twilio call error:', error);
      throw error;
    }
  }

  static generateTwiML(message, nextAction = null) {
    const twiml = new twilio.twiml.VoiceResponse();
    
    if (message) {
      twiml.say({ voice: 'alice' }, message);
    }

    if (nextAction === 'gather') {
      const gather = twiml.gather({
        input: 'speech',
        timeout: 10,
        speechTimeout: 'auto',
        action: `${process.env.BASE_URL}/webhook/voice/gather`
      });
      gather.say({ voice: 'alice' }, 'Please speak your response after the beep.');
    } else if (nextAction === 'hangup') {
      twiml.hangup();
    } else {
      twiml.pause({ length: 1 });
      twiml.hangup();
    }

    return twiml.toString();
  }

  static async sendSMS(toNumber, message, fromNumber = null) {
    try {
      const sms = await client.messages.create({
        body: message,
        to: toNumber,
        from: fromNumber || process.env.TWILIO_FROM_NUMBER
      });

      console.log(`SMS sent: ${sms.sid}`);
      return sms;
    } catch (error) {
      console.error('Twilio SMS error:', error);
      throw error;
    }
  }
}

export { client };