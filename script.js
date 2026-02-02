// ====== Editable data (tour dates) ======
// Replace these with real dates/venues/ticket links.
const DEFAULT_SHOWS = [
  {
    date: "2026-02-07",
    city: "Waterville, ME",
    venue: "Playhouse At Waterville Station",
    tickets: "https://example.com/tickets",
  },
  {
    date: "2026-03-20",
    city: "Boston, MA",
    venue: "Venue Name",
    tickets: "https://example.com/tickets",
  },
  {
    date: "2026-04-02",
    city: "New York, NY",
    venue: "Venue Name",
    tickets: "https://example.com/tickets",
  },
];

const STORAGE_KEY = "tourDates";

// ====== Helpers ======
function formatDate(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function upcomingShows(shows) {
  const now = new Date();
  return shows
    .map(s => ({ ...s, _time: new Date(s.date + "T23:59:59").getTime() }))
    .filter(s => s._time >= now.getTime())
    .sort((a,b) => a._time - b._time);
}

function cleanShows(shows) {
  if (!Array.isArray(shows)) return [];
  return shows
    .map(s => ({
      date: String(s.date || "").trim(),
      city: String(s.city || "").trim(),
      venue: String(s.venue || "").trim(),
      tickets: String(s.tickets || "").trim(),
    }))
    .filter(s => s.date && s.city && s.venue);
}

function loadShows() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_SHOWS;
  try {
    const parsed = JSON.parse(raw);
    const cleaned = cleanShows(parsed);
    return cleaned.length ? cleaned : DEFAULT_SHOWS;
  } catch {
    return DEFAULT_SHOWS;
  }
}

function saveShows(shows) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanShows(shows)));
}

function setTicketLink(linkEl, url) {
  linkEl.href = url;
  if (url.startsWith("#")) {
    linkEl.removeAttribute("target");
    linkEl.removeAttribute("rel");
  } else {
    linkEl.target = "_blank";
    linkEl.rel = "noreferrer";
  }
}

function renderTourList(shows) {
  const tourList = document.getElementById("tourList");
  if (!tourList) {
    console.warn("tourList not found");
    return;
  }

  if (shows.length === 0) {
    tourList.innerHTML = `
      <div class="tour-row">
        <div class="tour-date">No dates posted yet</div>
        <div class="tour-venue">Check back soon — or <a href="#contact">book Johnny</a>.</div>
        <div class="tour-actions"></div>
      </div>
    `;
    return;
  }

  tourList.innerHTML = shows.map(s => {
    const ticketUrl = s.tickets ? s.tickets : "#contact";
    const ticketAttrs = ticketUrl.startsWith("#")
      ? `href="${ticketUrl}"`
      : `href="${ticketUrl}" target="_blank" rel="noreferrer"`;

    return `
      <div class="tour-row">
        <div class="tour-date">${formatDate(s.date)}</div>
        <div class="tour-venue">${s.city} • ${s.venue}</div>
        <div class="tour-actions">
          <a class="btn btn-primary btn-small" ${ticketAttrs}>Tickets</a>
          <a class="btn btn-ghost btn-small" href="#contact">Book</a>
        </div>
      </div>
    `;
  }).join("");
}

function renderNextShow(shows) {
  const nextShowLine = document.getElementById("nextShowLine");
  const nextShowTickets = document.getElementById("nextShowTickets");
  if (!nextShowLine || !nextShowTickets) return;

  if (shows.length > 0) {
    const s = shows[0];
    nextShowLine.textContent = `${formatDate(s.date)} — ${s.city} • ${s.venue}`;
    setTicketLink(nextShowTickets, s.tickets ? s.tickets : "#contact");
  } else {
    nextShowLine.textContent = "Dates posting soon — booking open.";
    setTicketLink(nextShowTickets, "#contact");
  }
}

function renderShows(shows) {
  const upcoming = upcomingShows(shows);
  renderTourList(upcoming);
  renderNextShow(upcoming);
}

// ====== Date editor ======
const dateEditorTable = document.getElementById("dateEditorTable");
const dateEditorForm = document.getElementById("dateEditorForm");
const dateEditorNote = document.getElementById("dateEditorNote");
const addShowRow = document.getElementById("addShowRow");
const resetShowDates = document.getElementById("resetShowDates");

function createEditorRow(show = {}) {
  const row = document.createElement("div");
  row.className = "date-editor-row";
  row.innerHTML = `
    <input class="date-editor-input" type="date" value="${show.date || ""}" aria-label="Date" required />
    <input class="date-editor-input" type="text" value="${show.city || ""}" placeholder="City, ST" aria-label="City" required />
    <input class="date-editor-input" type="text" value="${show.venue || ""}" placeholder="Venue" aria-label="Venue" required />
    <input class="date-editor-input" type="url" value="${show.tickets || ""}" placeholder="Ticket URL (optional)" aria-label="Tickets" />
    <button class="btn btn-ghost btn-small" type="button" data-remove-row>Remove</button>
  `;
  return row;
}

function renderEditor(shows) {
  if (!dateEditorTable) return;

  dateEditorTable.innerHTML = `
    <div class="date-editor-row date-editor-head">
      <div>Date</div>
      <div>City</div>
      <div>Venue</div>
      <div>Tickets</div>
      <div></div>
    </div>
  `;

  if (!shows.length) {
    dateEditorTable.appendChild(createEditorRow());
    return;
  }

  shows.forEach(show => dateEditorTable.appendChild(createEditorRow(show)));
}

function readEditorRows() {
  if (!dateEditorTable) return [];
  return Array.from(dateEditorTable.querySelectorAll(".date-editor-row"))
    .filter(row => !row.classList.contains("date-editor-head"))
    .map(row => {
      const [date, city, venue, tickets] = row.querySelectorAll("input");
      return {
        date: date.value,
        city: city.value,
        venue: venue.value,
        tickets: tickets.value,
      };
    });
}

function setEditorNote(message) {
  if (dateEditorNote) {
    dateEditorNote.textContent = message;
  }
}

const currentShows = loadShows();
renderShows(currentShows);
renderEditor(currentShows);

if (dateEditorTable) {
  dateEditorTable.addEventListener("click", (event) => {
    const removeBtn = event.target.closest("[data-remove-row]");
    if (!removeBtn) return;
    const row = removeBtn.closest(".date-editor-row");
    if (row) row.remove();
  });
}

if (addShowRow) {
  addShowRow.addEventListener("click", () => {
    if (dateEditorTable) {
      dateEditorTable.appendChild(createEditorRow());
    }
  });
}

if (resetShowDates) {
  resetShowDates.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    renderShows(DEFAULT_SHOWS);
    renderEditor(DEFAULT_SHOWS);
    setEditorNote("Reset to default dates.");
  });
}

if (dateEditorForm) {
  dateEditorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const updated = cleanShows(readEditorRows());
    saveShows(updated);
    renderShows(updated);
    renderEditor(updated);
    setEditorNote("Saved. Tour list updated.");
  });
}

// ====== Mobile nav toggle ======
const navToggle = document.getElementById("navToggle");
const siteNav = document.getElementById("siteNav");

if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  // Close menu when clicking a link (mobile)
  siteNav.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", () => {
      siteNav.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

// ====== Footer year ======
document.getElementById("year").textContent = new Date().getFullYear();

// ====== Contact form (frontend-only demo) ======
const form = document.getElementById("contactForm");
const formNote = document.getElementById("formNote");

if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (formNote) {
      formNote.textContent = "Form demo: connect a real form handler (Netlify Forms, Formspree, etc.) to actually send this.";
    }
    form.reset();
  });
}