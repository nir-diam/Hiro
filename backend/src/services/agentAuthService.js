const jwt = require('jsonwebtoken');
const { ALL_AGENT_SCOPES, normalizeScopes } = require('../constants/agentScopes');

const AGENT_TOKEN_TYPE = 'agent';

const AGENT_USERNAME = 'agent1';
const AGENT_PASSWORD = 'hiroagent1234';

const HARDCODED_AGENT = Object.freeze({
  id: AGENT_USERNAME,
  username: AGENT_USERNAME,
  name: 'Agent',
  scopes: ALL_AGENT_SCOPES,
});

const getAgentJwtSecret = () =>
  process.env.AGENT_JWT_SECRET || process.env.JWT_SECRET || 'change_me_agent';

const getTokenTtl = () => process.env.AGENT_JWT_EXPIRES_IN || '30m';

const publicAgentView = () => ({
  id: HARDCODED_AGENT.id,
  username: HARDCODED_AGENT.username,
  name: HARDCODED_AGENT.name,
  scopes: normalizeScopes(HARDCODED_AGENT.scopes),
});

const issueToken = () =>
  jwt.sign(
    {
      typ: AGENT_TOKEN_TYPE,
      sub: HARDCODED_AGENT.id,
      username: HARDCODED_AGENT.username,
      name: HARDCODED_AGENT.name,
      scopes: normalizeScopes(HARDCODED_AGENT.scopes),
    },
    getAgentJwtSecret(),
    { expiresIn: getTokenTtl() },
  );

const verifyAgentToken = (token) => {
  const decoded = jwt.verify(token, getAgentJwtSecret());
  if (decoded?.typ !== AGENT_TOKEN_TYPE) {
    const err = new Error('Invalid agent token');
    err.status = 401;
    throw err;
  }
  if (decoded.sub !== HARDCODED_AGENT.id) {
    const err = new Error('Invalid agent token');
    err.status = 401;
    throw err;
  }
  return decoded;
};

const authenticate = ({ username, password }) => {
  const user = String(username || '').trim();
  const pass = String(password || '').trim();
  if (!user || !pass) {
    const err = new Error('username and password are required');
    err.status = 400;
    throw err;
  }
  if (user !== AGENT_USERNAME || pass !== AGENT_PASSWORD) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  return {
    accessToken: issueToken(),
    tokenType: 'Bearer',
    expiresIn: getTokenTtl(),
    agent: publicAgentView(),
  };
};

module.exports = {
  AGENT_TOKEN_TYPE,
  publicAgentView,
  issueToken,
  verifyAgentToken,
  authenticate,
};
