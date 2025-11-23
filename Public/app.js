async function submitInspection() {
  const input = document.getElementById("k3text").value;

  await fetch("/api/inspeksi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: input, created: new Date().toISOString() })
  });

  loadData();
}

async function loadData() {
  const res = await fetch("/api/inspeksi");
  const items = await res.json();

  document.getElementById("list").innerHTML = items
    .map(i => `<li>${i.text} — ${new Date(i.created).toLocaleString()}</li>`)
    .join("");
}

document.addEventListener("DOMContentLoaded", loadData);
