(function () {
  const STORAGE_KEY = "smoke-lab-research-ok";
  const TARGET = "../index.html?full=1&lab=1";

  /** SHA-256 hex of your passphrase. Default passphrase: smokelab */
  const GATE_HASH = "12b933406720fe7450e5bd038340ffc7bc37d754321f64f8551a63c8025dae1f";

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function goLab() {
    sessionStorage.setItem(STORAGE_KEY, "1");
    location.replace(TARGET);
  }

  if (sessionStorage.getItem(STORAGE_KEY) === "1") {
    goLab();
    return;
  }

  const form = document.getElementById("gateForm");
  const err = document.getElementById("gateErr");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    const pass = document.getElementById("gatePass").value;
    const hash = await sha256Hex(pass);
    if (hash === GATE_HASH) {
      goLab();
      return;
    }
    err.hidden = false;
  });
})();
