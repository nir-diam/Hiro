const SOURCE_DIM = 3072;
const TARGET_DIM = 1536;

let matrix = null;

// deterministic projection (seeded)
function initProjection() {
  matrix = Array.from({ length: TARGET_DIM }, (_, r) =>
    Array.from({ length: SOURCE_DIM }, (_, c) =>
      Math.sin(r * 131 + c * 17) / Math.sqrt(TARGET_DIM)
    )
  );
}

function project(vec) {
  if (!matrix) initProjection();

  return matrix.map(row =>
    row.reduce((sum, w, i) => sum + w * vec[i], 0)
  );
}

module.exports = { project, TARGET_DIM };
