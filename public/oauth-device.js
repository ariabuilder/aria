const codeForm = document.querySelector("#code-form");
const decisionForm = document.querySelector("#decision-form");
const review = document.querySelector("#review");
const scopes = document.querySelector("#scopes");
const message = document.querySelector("#message");
let userCode = "";

const labels = {
  "figma:context:read": "See available import destinations",
  "figma:assets:write": "Upload assets used by an import",
  "figma:imports:write": "Create or append to drafts",
};

async function send(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error_description || "Request failed");
  return value;
}

codeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  userCode = new FormData(codeForm).get("user_code")?.toString() || "";
  try {
    const value = await send("/oauth/device/inspect", { user_code: userCode });
    document.querySelector("#client-name").textContent = value.client.name;
    scopes.replaceChildren(
      ...value.scopes.map((scope) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.name = "scope";
        input.value = scope;
        input.checked = true;
        label.append(input, document.createTextNode(labels[scope] || scope));
        return label;
      }),
    );
    codeForm.hidden = true;
    document.querySelector("#intro").hidden = true;
    review.hidden = false;
  } catch (error) {
    message.textContent =
      error instanceof Error ? error.message : "Code not found";
  }
});

decisionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const selected = [
    ...decisionForm.querySelectorAll('input[name="scope"]:checked'),
  ].map((input) => input.value);
  try {
    await send("/oauth/device/approve", {
      user_code: userCode,
      scopes: selected,
    });
    review.hidden = true;
    message.textContent = "Connected. You can return to Figma.";
  } catch (error) {
    message.textContent =
      error instanceof Error ? error.message : "Approval failed";
  }
});

document.querySelector("#deny")?.addEventListener("click", async () => {
  try {
    await send("/oauth/device/deny", { user_code: userCode });
    review.hidden = true;
    message.textContent = "Connection denied.";
  } catch (error) {
    message.textContent =
      error instanceof Error ? error.message : "Request failed";
  }
});
