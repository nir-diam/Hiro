const ALERT_SOURCE = 'hiro-alerts';

let snsModule = null;
let snsModuleChecked = false;

function loadSnsModule() {
  if (snsModuleChecked) return snsModule;
  snsModuleChecked = true;
  try {
    snsModule = require('@aws-sdk/client-sns');
  } catch (err) {
    if (String(err?.code) === 'MODULE_NOT_FOUND') {
      console.warn(`[${ALERT_SOURCE}] @aws-sdk/client-sns not installed — alerts will log to console only`);
    } else {
      console.warn(`[${ALERT_SOURCE}] failed to load SNS SDK`, err?.message || err);
    }
    snsModule = null;
  }
  return snsModule;
}

function getTopicArn() {
  return String(process.env.HIRO_ALERTS_SNS_TOPIC_ARN || '').trim();
}

function isConfigured() {
  return Boolean(getTopicArn()) && Boolean(loadSnsModule());
}

/**
 * Publish an operational alert to SNS (hiro-alerts topic).
 * Falls back to structured console.error when SNS is not configured or SDK is missing.
 * @param {{ subject: string, message: string, attributes?: Record<string, string> }} payload
 */
async function publishOpsAlert(payload = {}) {
  const subject = String(payload.subject || 'Hiro alert').slice(0, 100);
  const message = String(payload.message || '').slice(0, 8000);
  const attributes = payload.attributes && typeof payload.attributes === 'object' ? payload.attributes : {};

  const topicArn = getTopicArn();
  const sns = loadSnsModule();

  if (!topicArn || !sns) {
    console.error(`[${ALERT_SOURCE}]`, subject, message, attributes);
    return { delivered: false, channel: 'console' };
  }

  try {
    const { SNSClient, PublishCommand } = sns;
    const client = new SNSClient({});
    const messageAttributes = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (value == null || String(value).trim() === '') continue;
      messageAttributes[key] = { DataType: 'String', StringValue: String(value).slice(0, 256) };
    }

    await client.send(
      new PublishCommand({
        TopicArn: topicArn,
        Subject: subject,
        Message: message,
        MessageAttributes: messageAttributes,
      }),
    );

    return { delivered: true, channel: 'sns' };
  } catch (err) {
    console.error(`[${ALERT_SOURCE}] publish failed`, err?.message || err, { subject, message });
    return { delivered: false, channel: 'sns_error', error: err?.message || String(err) };
  }
}

module.exports = {
  ALERT_SOURCE,
  isConfigured,
  publishOpsAlert,
};
