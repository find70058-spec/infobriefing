const data = JSON.parse(document.getElementById("search-data").textContent);
const input = document.getElementById("q");
const results = document.getElementById("results");

function render(items) {
  results.innerHTML = items
    .map(
      (item) => `<article class="card"><a class="card-link" href="${item.url}">
        <span class="eyebrow">${item.category}</span>
        <h3>${item.title}</h3>
        <p>${item.description}</p>
      </a></article>`
    )
    .join("");
}

function search() {
  const query = input.value.trim().toLowerCase();
  if (!query) {
    render(data.slice(0, 9));
    return;
  }
  render(
    data.filter((item) =>
      [item.title, item.description, item.category, ...(item.tags || [])]
        .join(" ")
        .toLowerCase()
        .includes(query)
    )
  );
}

input.addEventListener("input", search);
render(data.slice(0, 9));
