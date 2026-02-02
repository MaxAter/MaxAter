// ====== Editable data (show dates) ======
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
const SITE_EDITOR_KEY = "siteEditor";
const INSTAGRAM_KEY = "instagramHandle";
const MAILTO_SUBJECT = "Booking Inquiry - Johnny Ater";

const isLocalHost = ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname)
  || window.location.hostname.endsWith(".local")
  || window.location.hostname === "";

if (isLocalHost) {
  document.body.classList.add("is-local");
}

const BUTTON_RADIUS_MAP = {
  pill: "999px",
  rounded: "14px",
  square: "6px",
};

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

// ====== Instagram widget (local handle) ======
const instagramSection = document.getElementById("instagram");
const instagramHandleText = document.getElementById("instagramHandleText");
const instagramProfileLink = document.getElementById("instagramProfileLink");
const instagramEmbed = document.getElementById("instagramEmbed");
const instagramEditorForm = document.getElementById("instagramEditorForm");
const instagramHandleInput = document.getElementById("instagramHandleInput");
const resetInstagramHandle = document.getElementById("resetInstagramHandle");
const instagramEditorNote = document.getElementById("instagramEditorNote");

function normalizeInstagramHandle(value) {
  return String(value || "").trim().replace(/^@/, "");
}

function applyInstagramHandle(handle) {
  const cleaned = normalizeInstagramHandle(handle);
  const displayHandle = cleaned || "johnnyater";
  const profileUrl = `https://www.instagram.com/${displayHandle}/`;
  const embedUrl = `https://www.instagram.com/${displayHandle}/embed`;

  if (instagramHandleText) instagramHandleText.textContent = displayHandle;
  if (instagramProfileLink) instagramProfileLink.href = profileUrl;
  if (instagramEmbed) instagramEmbed.src = embedUrl;
}

function setInstagramEditorNote(message) {
  if (instagramEditorNote) {
    instagramEditorNote.textContent = message;
  }
}

if (instagramSection) {
  const defaultHandle = normalizeInstagramHandle(instagramSection.dataset.instagramHandle || "johnnyater");
  const storedHandle = localStorage.getItem(INSTAGRAM_KEY);
  const activeHandle = normalizeInstagramHandle(storedHandle || defaultHandle);
  applyInstagramHandle(activeHandle);
  if (instagramHandleInput) instagramHandleInput.value = activeHandle;
}

if (instagramEditorForm) {
  instagramEditorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const updatedHandle = normalizeInstagramHandle(instagramHandleInput ? instagramHandleInput.value : "");
    localStorage.setItem(INSTAGRAM_KEY, updatedHandle);
    applyInstagramHandle(updatedHandle);
    setInstagramEditorNote("Saved. Instagram handle updated.");
  });
}

if (resetInstagramHandle) {
  resetInstagramHandle.addEventListener("click", () => {
    localStorage.removeItem(INSTAGRAM_KEY);
    const defaultHandle = normalizeInstagramHandle(instagramSection?.dataset.instagramHandle || "johnnyater");
    applyInstagramHandle(defaultHandle);
    if (instagramHandleInput) instagramHandleInput.value = defaultHandle;
    setInstagramEditorNote("Reset to default handle.");
  });
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

// ====== Local site editor ======
const siteEditorForm = document.getElementById("siteEditorForm");
const resetSiteEditor = document.getElementById("resetSiteEditor");
const siteEditorNote = document.getElementById("siteEditorNote");

function getTextById(id, fallback = "") {
  const el = document.getElementById(id);
  return el ? el.textContent.trim() : fallback;
}

function getAttrById(id, attr, fallback = "") {
  const el = document.getElementById(id);
  return el ? (el.getAttribute(attr) || fallback) : fallback;
}

function getCssVar(name, fallback = "") {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function normalizeYouTubeUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : url;
    }
    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : url;
    }
  } catch {
    return url;
  }
  return url;
}

function mergeDeep(target, source) {
  if (!source || typeof source !== "object") return target;
  const output = { ...target };
  Object.keys(source).forEach(key => {
    if (Array.isArray(source[key])) {
      output[key] = source[key];
    } else if (source[key] && typeof source[key] === "object") {
      output[key] = mergeDeep(target[key] || {}, source[key]);
    } else {
      output[key] = source[key];
    }
  });
  return output;
}

function getDefaultContent() {
  const defaultPhoneHref = getAttrById("contactPhone", "href", "tel:+12075550123").replace("tel:", "");
  const currentRadius = getCssVar("--btn-radius", BUTTON_RADIUS_MAP.pill);
  const buttonStyle = Object.keys(BUTTON_RADIUS_MAP).find(key => BUTTON_RADIUS_MAP[key] === currentRadius) || "pill";
  const socialHref = id => {
    const href = getAttrById(id, "href", "");
    return href && href !== "#" ? href : "";
  };

  return {
    hero: {
      eyebrow: getTextById("heroEyebrow", "Comedian • Maine"),
      title: getTextById("heroTitle", "Johnny Ater"),
      titleSoft: getTextById("heroTitleSoft", "Comedy"),
      sub: getTextById("heroSub", ""),
      primaryCtaText: getTextById("heroPrimaryCta", "Book Johnny"),
      primaryCtaHref: getAttrById("heroPrimaryCta", "href", "#contact"),
      secondaryCtaText: getTextById("heroSecondaryCta", "See Show Dates"),
      secondaryCtaHref: getAttrById("heroSecondaryCta", "href", "#tour"),
    },
    watch: {
      embed: getAttrById("watchEmbed", "src", ""),
      cards: [
        {
          title: getTextById("watchCard1Title", "Clip Title"),
          sub: getTextById("watchCard1Sub", "Short description"),
          href: getAttrById("watchCard1", "href", "#"),
        },
        {
          title: getTextById("watchCard2Title", "Clip Title"),
          sub: getTextById("watchCard2Sub", "Short description"),
          href: getAttrById("watchCard2", "href", "#"),
        },
        {
          title: getTextById("watchCard3Title", "Clip Title"),
          sub: getTextById("watchCard3Sub", "Short description"),
          href: getAttrById("watchCard3", "href", "#"),
        },
      ],
    },
    press: {
      link1Text: getTextById("pressLink1", "Download Press Kit (PDF)"),
      link1Href: getAttrById("pressLink1", "href", "#"),
      link2Text: getTextById("pressLink2", "High-Res Photos"),
      link2Href: getAttrById("pressLink2", "href", "#"),
      link3Text: getTextById("pressLink3", "Tech / Stage Requirements"),
      link3Href: getAttrById("pressLink3", "href", "#"),
      shortBio: getTextById("pressShortBio", ""),
    },
    about: {
      text: getTextById("aboutText", ""),
    },
    contact: {
      email: getTextById("contactEmail", "booking@johnnyatercomedy.com"),
      phone: getTextById("contactPhone", "(207) 555-0123"),
      phoneHref: defaultPhoneHref,
      location: getTextById("contactLocation", "Maine, USA"),
    },
    social: {
      instagram: socialHref("socialInstagram"),
      youtube: socialHref("socialYouTube"),
      tiktok: socialHref("socialTikTok"),
      facebook: socialHref("socialFacebook"),
    },
    brand: {
      logoSrc: getAttrById("brandLogo", "src", ""),
      logoAlt: getAttrById("brandLogo", "alt", "Johnny Ater logo"),
      primary: getCssVar("--navy", "#0b1b3a"),
      secondary: getCssVar("--navy2", "#102a5a"),
      buttonStyle,
    },
  };
}

function loadEditorData(defaults) {
  const raw = localStorage.getItem(SITE_EDITOR_KEY);
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw);
    return mergeDeep(defaults, parsed);
  } catch {
    return defaults;
  }
}

function saveEditorData(data) {
  localStorage.setItem(SITE_EDITOR_KEY, JSON.stringify(data));
}

function setTextById(id, value) {
  const el = document.getElementById(id);
  if (el && typeof value === "string") {
    el.textContent = value;
  }
}

function setLink(id, text, href) {
  const el = document.getElementById(id);
  if (!el) return;
  if (typeof text === "string") el.textContent = text;
  if (typeof href === "string") el.setAttribute("href", href);
}

function setSocialLink(id, href) {
  const el = document.getElementById(id);
  if (!el) return;
  if (href) {
    el.setAttribute("href", href);
    el.style.display = "";
  } else {
    el.setAttribute("href", "#");
    el.style.display = "none";
  }
}

function setCssVar(name, value) {
  if (value) {
    document.documentElement.style.setProperty(name, value);
  } else {
    document.documentElement.style.removeProperty(name);
  }
}

function applyEditorData(data) {
  if (!data) return;

  setTextById("heroEyebrow", data.hero.eyebrow);
  setTextById("heroTitle", data.hero.title);
  setTextById("heroTitleSoft", data.hero.titleSoft);
  setTextById("heroSub", data.hero.sub);
  setLink("heroPrimaryCta", data.hero.primaryCtaText, data.hero.primaryCtaHref);
  setLink("heroSecondaryCta", data.hero.secondaryCtaText, data.hero.secondaryCtaHref);

  const heroSoft = document.getElementById("heroTitleSoft");
  if (heroSoft) {
    heroSoft.style.display = data.hero.titleSoft ? "block" : "none";
  }

  const watchEmbed = document.getElementById("watchEmbed");
  if (watchEmbed) {
    const embedUrl = normalizeYouTubeUrl(data.watch.embed);
    if (embedUrl) watchEmbed.setAttribute("src", embedUrl);
  }

  data.watch.cards.forEach((card, index) => {
    const idx = index + 1;
    setTextById(`watchCard${idx}Title`, card.title);
    setTextById(`watchCard${idx}Sub`, card.sub);
    setLink(`watchCard${idx}`, null, card.href || "#");
  });

  setLink("pressLink1", data.press.link1Text, data.press.link1Href);
  setLink("pressLink2", data.press.link2Text, data.press.link2Href);
  setLink("pressLink3", data.press.link3Text, data.press.link3Href);
  setTextById("pressShortBio", data.press.shortBio);

  setTextById("aboutText", data.about.text);

  setTextById("contactEmail", data.contact.email);
  const emailHref = `mailto:${data.contact.email}?subject=${encodeURIComponent(MAILTO_SUBJECT)}`;
  setLink("contactEmail", null, emailHref);
  setLink("contactEmailButton", null, emailHref);

  setTextById("contactPhone", data.contact.phone);
  const phoneHref = data.contact.phoneHref || data.contact.phone.replace(/[^\d+]/g, "");
  setLink("contactPhone", null, `tel:${phoneHref}`);
  setTextById("contactLocation", data.contact.location);

  setSocialLink("socialInstagram", data.social.instagram);
  setSocialLink("socialYouTube", data.social.youtube);
  setSocialLink("socialTikTok", data.social.tiktok);
  setSocialLink("socialFacebook", data.social.facebook);

  const brandLogo = document.getElementById("brandLogo");
  if (brandLogo) {
    if (data.brand.logoSrc) {
      brandLogo.setAttribute("src", data.brand.logoSrc);
      brandLogo.style.display = "";
    } else {
      brandLogo.style.display = "none";
    }
    brandLogo.setAttribute("alt", data.brand.logoAlt || "Johnny Ater logo");
  }

  setCssVar("--navy", data.brand.primary);
  setCssVar("--navy2", data.brand.secondary);
  setCssVar("--btn-radius", BUTTON_RADIUS_MAP[data.brand.buttonStyle] || BUTTON_RADIUS_MAP.pill);
}

function setInputValue(id, value) {
  const input = document.getElementById(id);
  if (!input) return;
  input.value = value || "";
}

function setEditorValues(data) {
  setInputValue("editorHeroEyebrow", data.hero.eyebrow);
  setInputValue("editorHeroTitle", data.hero.title);
  setInputValue("editorHeroTitleSoft", data.hero.titleSoft);
  setInputValue("editorHeroSub", data.hero.sub);
  setInputValue("editorHeroPrimaryText", data.hero.primaryCtaText);
  setInputValue("editorHeroPrimaryHref", data.hero.primaryCtaHref);
  setInputValue("editorHeroSecondaryText", data.hero.secondaryCtaText);
  setInputValue("editorHeroSecondaryHref", data.hero.secondaryCtaHref);

  setInputValue("editorWatchEmbed", data.watch.embed);
  setInputValue("editorWatchCard1Title", data.watch.cards[0]?.title);
  setInputValue("editorWatchCard1Sub", data.watch.cards[0]?.sub);
  setInputValue("editorWatchCard1Href", data.watch.cards[0]?.href);
  setInputValue("editorWatchCard2Title", data.watch.cards[1]?.title);
  setInputValue("editorWatchCard2Sub", data.watch.cards[1]?.sub);
  setInputValue("editorWatchCard2Href", data.watch.cards[1]?.href);
  setInputValue("editorWatchCard3Title", data.watch.cards[2]?.title);
  setInputValue("editorWatchCard3Sub", data.watch.cards[2]?.sub);
  setInputValue("editorWatchCard3Href", data.watch.cards[2]?.href);

  setInputValue("editorPressLink1Text", data.press.link1Text);
  setInputValue("editorPressLink1Href", data.press.link1Href);
  setInputValue("editorPressLink2Text", data.press.link2Text);
  setInputValue("editorPressLink2Href", data.press.link2Href);
  setInputValue("editorPressLink3Text", data.press.link3Text);
  setInputValue("editorPressLink3Href", data.press.link3Href);
  setInputValue("editorPressShortBio", data.press.shortBio);

  setInputValue("editorAboutText", data.about.text);

  setInputValue("editorContactEmail", data.contact.email);
  setInputValue("editorContactPhone", data.contact.phone);
  setInputValue("editorContactPhoneHref", data.contact.phoneHref);
  setInputValue("editorContactLocation", data.contact.location);

  setInputValue("editorSocialInstagram", data.social.instagram);
  setInputValue("editorSocialYouTube", data.social.youtube);
  setInputValue("editorSocialTikTok", data.social.tiktok);
  setInputValue("editorSocialFacebook", data.social.facebook);

  setInputValue("editorBrandLogo", data.brand.logoSrc);
  setInputValue("editorBrandLogoAlt", data.brand.logoAlt);
  setInputValue("editorBrandPrimary", data.brand.primary);
  setInputValue("editorBrandSecondary", data.brand.secondary);
  setInputValue("editorButtonStyle", data.brand.buttonStyle);
}

function readEditorValues(defaults) {
  const getValue = id => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  };

  return {
    hero: {
      eyebrow: getValue("editorHeroEyebrow") || defaults.hero.eyebrow,
      title: getValue("editorHeroTitle") || defaults.hero.title,
      titleSoft: getValue("editorHeroTitleSoft") || "",
      sub: getValue("editorHeroSub") || defaults.hero.sub,
      primaryCtaText: getValue("editorHeroPrimaryText") || defaults.hero.primaryCtaText,
      primaryCtaHref: getValue("editorHeroPrimaryHref") || defaults.hero.primaryCtaHref,
      secondaryCtaText: getValue("editorHeroSecondaryText") || defaults.hero.secondaryCtaText,
      secondaryCtaHref: getValue("editorHeroSecondaryHref") || defaults.hero.secondaryCtaHref,
    },
    watch: {
      embed: getValue("editorWatchEmbed") || defaults.watch.embed,
      cards: [
        {
          title: getValue("editorWatchCard1Title") || defaults.watch.cards[0].title,
          sub: getValue("editorWatchCard1Sub") || defaults.watch.cards[0].sub,
          href: getValue("editorWatchCard1Href") || defaults.watch.cards[0].href,
        },
        {
          title: getValue("editorWatchCard2Title") || defaults.watch.cards[1].title,
          sub: getValue("editorWatchCard2Sub") || defaults.watch.cards[1].sub,
          href: getValue("editorWatchCard2Href") || defaults.watch.cards[1].href,
        },
        {
          title: getValue("editorWatchCard3Title") || defaults.watch.cards[2].title,
          sub: getValue("editorWatchCard3Sub") || defaults.watch.cards[2].sub,
          href: getValue("editorWatchCard3Href") || defaults.watch.cards[2].href,
        },
      ],
    },
    press: {
      link1Text: getValue("editorPressLink1Text") || defaults.press.link1Text,
      link1Href: getValue("editorPressLink1Href") || defaults.press.link1Href,
      link2Text: getValue("editorPressLink2Text") || defaults.press.link2Text,
      link2Href: getValue("editorPressLink2Href") || defaults.press.link2Href,
      link3Text: getValue("editorPressLink3Text") || defaults.press.link3Text,
      link3Href: getValue("editorPressLink3Href") || defaults.press.link3Href,
      shortBio: getValue("editorPressShortBio") || defaults.press.shortBio,
    },
    about: {
      text: getValue("editorAboutText") || defaults.about.text,
    },
    contact: {
      email: getValue("editorContactEmail") || defaults.contact.email,
      phone: getValue("editorContactPhone") || defaults.contact.phone,
      phoneHref: getValue("editorContactPhoneHref") || defaults.contact.phoneHref,
      location: getValue("editorContactLocation") || defaults.contact.location,
    },
    social: {
      instagram: getValue("editorSocialInstagram"),
      youtube: getValue("editorSocialYouTube"),
      tiktok: getValue("editorSocialTikTok"),
      facebook: getValue("editorSocialFacebook"),
    },
    brand: {
      logoSrc: getValue("editorBrandLogo") || defaults.brand.logoSrc,
      logoAlt: getValue("editorBrandLogoAlt") || defaults.brand.logoAlt,
      primary: getValue("editorBrandPrimary") || defaults.brand.primary,
      secondary: getValue("editorBrandSecondary") || defaults.brand.secondary,
      buttonStyle: getValue("editorButtonStyle") || defaults.brand.buttonStyle,
    },
  };
}

function setSiteEditorNote(message) {
  if (siteEditorNote) {
    siteEditorNote.textContent = message;
  }
}

const defaultEditorContent = getDefaultContent();
const storedEditorContent = loadEditorData(defaultEditorContent);
applyEditorData(storedEditorContent);
setEditorValues(storedEditorContent);

if (siteEditorForm) {
  siteEditorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const updated = readEditorValues(defaultEditorContent);
    saveEditorData(updated);
    applyEditorData(updated);
    setSiteEditorNote("Saved. Changes applied locally.");
  });
}

if (resetSiteEditor) {
  resetSiteEditor.addEventListener("click", () => {
    localStorage.removeItem(SITE_EDITOR_KEY);
    applyEditorData(defaultEditorContent);
    setEditorValues(defaultEditorContent);
    setSiteEditorNote("Reset to defaults.");
  });
}

// ====== Local chat widget ======
const CHAT_ENDPOINT_KEY = "chatEndpoint";
const CHAT_MESSAGES_KEY = "chatMessages";

const chatWidget = document.getElementById("chatWidget");
const chatPanel = document.getElementById("chatPanel");
const chatToggle = document.getElementById("chatToggle");
const chatMinimize = document.getElementById("chatMinimize");
const chatMessagesEl = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatEndpointInput = document.getElementById("chatEndpoint");
const chatSaveSettings = document.getElementById("chatSaveSettings");
const chatClearHistory = document.getElementById("chatClearHistory");
const chatStatus = document.getElementById("chatStatus");

let chatMessages = [];

function loadChatMessages() {
  const raw = localStorage.getItem(CHAT_MESSAGES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveChatMessages() {
  localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(chatMessages));
}

function renderChatMessages() {
  if (!chatMessagesEl) return;
  chatMessagesEl.innerHTML = "";
  chatMessages.forEach(msg => {
    const bubble = document.createElement("div");
    bubble.className = `chat-message ${msg.role}`;
    bubble.textContent = msg.text;
    chatMessagesEl.appendChild(bubble);
  });
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function addChatMessage(role, text) {
  chatMessages.push({ role, text, ts: Date.now() });
  saveChatMessages();
  renderChatMessages();
}

function setChatStatus(message) {
  if (chatStatus) {
    chatStatus.textContent = message;
  }
}

function getChatEndpoint() {
  const stored = localStorage.getItem(CHAT_ENDPOINT_KEY) || "";
  return (chatEndpointInput ? chatEndpointInput.value : stored).trim() || stored.trim();
}

function setChatCollapsed(collapsed) {
  if (!chatPanel || !chatToggle) return;
  chatPanel.classList.toggle("is-collapsed", collapsed);
  chatToggle.setAttribute("aria-expanded", String(!collapsed));
}

async function sendToPipeline(endpoint, payload) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  const data = await res.json();
  return data.reply || data.message || data.output || data?.choices?.[0]?.message?.content || "";
}

if (chatWidget) {
  chatMessages = loadChatMessages();
  renderChatMessages();
  const storedEndpoint = localStorage.getItem(CHAT_ENDPOINT_KEY) || "";
  if (chatEndpointInput) chatEndpointInput.value = storedEndpoint;
  setChatStatus(storedEndpoint ? "Pipeline configured." : "Add a pipeline endpoint to receive replies.");
}

if (chatToggle) {
  chatToggle.addEventListener("click", () => {
    const isCollapsed = chatPanel ? chatPanel.classList.contains("is-collapsed") : false;
    setChatCollapsed(!isCollapsed);
  });
}

if (chatMinimize) {
  chatMinimize.addEventListener("click", () => {
    setChatCollapsed(true);
  });
}

if (chatSaveSettings) {
  chatSaveSettings.addEventListener("click", () => {
    const endpoint = chatEndpointInput ? chatEndpointInput.value.trim() : "";
    localStorage.setItem(CHAT_ENDPOINT_KEY, endpoint);
    setChatStatus(endpoint ? "Pipeline configured." : "Pipeline cleared.");
  });
}

if (chatClearHistory) {
  chatClearHistory.addEventListener("click", () => {
    chatMessages = [];
    localStorage.removeItem(CHAT_MESSAGES_KEY);
    renderChatMessages();
    setChatStatus("Chat history cleared.");
  });
}

if (chatForm) {
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = chatInput ? chatInput.value.trim() : "";
    if (!text) return;
    if (chatInput) chatInput.value = "";
    addChatMessage("user", text);

    const endpoint = getChatEndpoint();
    if (!endpoint) {
      addChatMessage("system", "No pipeline configured. Add an endpoint under Pipeline.");
      return;
    }

    try {
      const reply = await sendToPipeline(endpoint, {
        message: text,
        history: chatMessages.map(msg => ({ role: msg.role, content: msg.text })),
      });
      addChatMessage("assistant", reply || "No reply received.");
    } catch (error) {
      addChatMessage("system", `Pipeline error: ${error.message}`);
    }
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