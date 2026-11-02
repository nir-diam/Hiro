/** True while `processEmailUpload` (or similar) is on the stack — used to throttle DB use. */
let emailIngestDepth = 0;

const runInEmailIngest = async (fn) => {
  emailIngestDepth += 1;
  try {
    return await fn();
  } finally {
    emailIngestDepth = Math.max(0, emailIngestDepth - 1);
  }
};

const isEmailIngestActive = () => emailIngestDepth > 0;

module.exports = {
  runInEmailIngest,
  isEmailIngestActive,
};
