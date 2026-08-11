require('dotenv').config({ path: require('path').join(__dirname, '../src/.env') });
const axios = require('axios');

const user = (process.env.INFORU_SMS_USER_NAME || '').trim();
const token = (process.env.INFORU_SMS_API_TOKEN || '').trim();
const capiUrl = 'https://capi.inforu.co.il/api/v2/SMS/SendSms';
const soapUrl = 'https://uapi.inforu.co.il/v2/SendMessage.asmx';
const capiBody = {
  Data: {
    Message: 'Hiro test',
    Recipients: [{ Phone: '0500000000' }],
    Settings: { Sender: 'Hiro' },
  },
};

async function testCapi(name, headers, body = capiBody) {
  const res = await axios.post(capiUrl, body, {
    headers: { 'Content-Type': 'application/json', ...headers },
    validateStatus: () => true,
    timeout: 15000,
  });
  console.log('CAPI', name, res.status, res.data?.StatusId, res.data?.StatusDescription);
}

async function testSoap() {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SendSms xmlns="http://inforu.co.il/api/v2/asmx/SendMessage/">
      <userName>${user}</userName>
      <apiToken>${token}</apiToken>
      <message>test</message>
      <recipients>0500000000</recipients>
      <senderName>Hiro</senderName>
      <senderNumber>0000</senderNumber>
    </SendSms>
  </soap:Body>
</soap:Envelope>`;
  const res = await axios.post(soapUrl, xml, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: 'http://inforu.co.il/api/v2/asmx/SendMessage/SendSms',
    },
    validateStatus: () => true,
    timeout: 15000,
  });
  const m = String(res.data).match(/<Status>([^<]+)<\/Status>[\s\S]*?<Description>([^<]+)<\/Description>/);
  console.log('SOAP', m ? `${m[1]} ${m[2]}` : res.status);
  if (!m) console.log(String(res.data).slice(0, 600));
}

(async () => {
  console.log('user', user, 'token', token.slice(0, 8) + '...');
  const basic = 'Basic ' + Buffer.from(`${user}:${token}`, 'utf8').toString('base64');
  console.log('computed Base Credential:', Buffer.from(`${user}:${token}`, 'utf8').toString('base64'));
  await testCapi('bearer', { Authorization: `Bearer ${token}` });
  await testCapi('basic (Base Credential)', { Authorization: basic });
  await testCapi('body-auth', {}, { Auth: { Username: user, Token: token }, ...capiBody });
  await testSoap();
})().catch((e) => console.error(e.message));
