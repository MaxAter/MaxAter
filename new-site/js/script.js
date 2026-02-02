const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector("[data-nav]");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.tagName === "A") {
      navLinks.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });
}

const yearSpan = document.querySelector("[data-year]");
if (yearSpan) {
  yearSpan.textContent = String(new Date().getFullYear());
}
