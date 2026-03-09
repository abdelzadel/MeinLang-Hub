const backButton = document.getElementById("backButton");
const stepLabel = document.getElementById("stepLabel");
const viewTitle = document.getElementById("viewTitle");
const pathText = document.getElementById("pathText");
const searchWrap = document.getElementById("searchWrap");
const searchInput = document.getElementById("searchInput");
const cardGrid = document.getElementById("cardGrid");
const listPlaceholder = document.getElementById("listPlaceholder");
const listView = document.getElementById("listView");
const contentView = document.getElementById("contentView");
const contentMeta = document.getElementById("contentMeta");
const contentArea = document.getElementById("contentArea");
const errorMessage = document.getElementById("errorMessage");

const importModal = document.getElementById("importModal");
const importForm = document.getElementById("importForm");
const importTargetLabel = document.getElementById("importTargetLabel");
const importEndpointHint = document.getElementById("importEndpointHint");
const importAuthFields = document.getElementById("importAuthFields");
const importEmail = document.getElementById("importEmail");
const importPassword = document.getElementById("importPassword");
const importTagInput = document.getElementById("importTag");
const importTerms = document.getElementById("importTerms");
const importStatus = document.getElementById("importStatus");
const importLoader = document.getElementById("importLoader");
const importSubmitButton = document.getElementById("importSubmitButton");
const importCancelButton = document.getElementById("importCancelButton");
const importCloseButton = document.getElementById("importCloseButton");

const ROOT_FOLDER = "texts";
const STATIC_INDEX_FILE = `${ROOT_FOLDER}/catalog.json`;
const VIEW = {
  LANGUAGES: "languages",
  SUBFOLDERS: "subfolders",
  FILES: "files",
  CONTENT: "content",
};

const LANGUAGE_FLAGS = {
  english: "gb",
  arabic: "sa",
  french: "fr",
  german: "de",
  spanish: "es",
  italian: "it",
  portuguese: "pt",
  chinese: "cn",
  japanese: "jp",
  turkish: "tr",
};

const state = {
  view: VIEW.LANGUAGES,
  language: "",
  subfolder: "",
  file: "",
};

const BRANCH_FALLBACKS = ["main", "master"];
const githubContext = detectGitHubPagesContext();
const importConfig = getImportConfigFromUrl();

let githubBranch = "main";
let staticTreeIndex = null;
let currentCards = [];
let onCardSelect = null;
let activeImportTarget = { language: "", subfolder: "" };

const directoryCache = new Map();
const fileCache = new Map();

window.addEventListener("DOMContentLoaded", async () => {
  setupImportModal();
  await initializeSource();
  await restoreFromQueryParams();
});

async function initializeSource() {
  staticTreeIndex = await loadStaticTreeIndex();

  if (staticTreeIndex) {
    return;
  }

  if (!githubContext) {
    return;
  }

  try {
    githubBranch = await fetchDefaultBranch(githubContext.owner, githubContext.repo);
  } catch (error) {
    console.warn("Could not detect default branch. Falling back to main/master.", error);
  }
}

async function restoreFromQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const language = sanitizeQueryParam(params.get("language"));
  const subfolder = sanitizeQueryParam(params.get("subfolder"), true);
  const file = sanitizeQueryParam(params.get("file"));

  await renderLanguages();

  if (!language) {
    return;
  }

  try {
    const languages = await listDirectoryNames([ROOT_FOLDER]);
    const resolvedLanguage = resolveValueFromList(language, languages);

    if (!resolvedLanguage) {
      await resetToMainPage();
      return;
    }

    await renderSubfolders(resolvedLanguage);

    if (!subfolder) {
      return;
    }

    const subfolders = await listDirectoryNames([ROOT_FOLDER, resolvedLanguage]);
    const resolvedSubfolder = resolveValueFromList(subfolder, subfolders);

    if (!resolvedSubfolder) {
      return;
    }

    await renderFiles(resolvedLanguage, resolvedSubfolder);

    if (!file) {
      return;
    }

    const files = await listTextFileNames([ROOT_FOLDER, resolvedLanguage, resolvedSubfolder]);
    const resolvedFile = resolveValueFromList(file, files);

    if (!resolvedFile) {
      return;
    }

    await renderContent(resolvedLanguage, resolvedSubfolder, resolvedFile);
  } catch (error) {
    console.error("Could not restore selection from query params.", error);
    await resetToMainPage();
  }
}

async function listDirectoryNames(parts) {
  const entries = await readDirectory(parts);
  return entries.filter((entry) => entry.isDirectory).map((entry) => entry.name);
}

async function listTextFileNames(parts) {
  const entries = await readDirectory(parts);
  return entries
    .filter((entry) => !entry.isDirectory && entry.name.toLowerCase().endsWith(".txt"))
    .map((entry) => entry.name);
}

async function resetToMainPage() {
  state.language = "";
  state.subfolder = "";
  state.file = "";
  syncQueryParams();
  await renderLanguages();
}

function resolveValueFromList(rawValue, values) {
  const target = String(rawValue || "").trim();
  if (!target || !Array.isArray(values) || !values.length) {
    return "";
  }

  const directMatch = values.find((value) => value === target);
  if (directMatch) {
    return directMatch;
  }

  const normalizedTarget = normalizeLookupToken(target);
  return values.find((value) => normalizeLookupToken(value) === normalizedTarget) || "";
}

function normalizeLookupToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[ _-]+/g, "");
}

async function renderLanguages() {
  state.view = VIEW.LANGUAGES;
  state.language = "";
  state.subfolder = "";
  state.file = "";
  syncQueryParams();

  setHeader("Languages", "Select a language", `/${ROOT_FOLDER}`);
  toggleBackButton();
  showListMode();
  clearError();

  try {
    const entries = await readDirectory([ROOT_FOLDER]);
    const languages = entries.filter((entry) => entry.isDirectory).map((entry) => entry.name).sort();

    currentCards = languages.map((language) => ({
      key: language,
      search: language.toLowerCase(),
      main: formatLabel(language),
      flagCode: getLanguageFlagCode(language),
      sub: "Open language folder",
      active: false,
      secondaryAction: null,
    }));

    onCardSelect = (item) => {
      renderSubfolders(item.key);
    };

    renderCards();
  } catch (error) {
    handleError(error, "Could not load the languages folder.");
  }
}

async function renderSubfolders(language) {
  state.view = VIEW.SUBFOLDERS;
  state.language = language;
  state.subfolder = "";
  state.file = "";
  syncQueryParams();

  setHeader("Subfolders", `Select a subfolder in ${formatLabel(language)}`, `/${ROOT_FOLDER}/${language}`);
  toggleBackButton();
  showListMode();
  clearError();

  try {
    const entries = await readDirectory([ROOT_FOLDER, language]);
    const subfolders = entries.filter((entry) => entry.isDirectory).map((entry) => entry.name).sort();

    const importEnabled = Boolean(importConfig.endpoint);

    currentCards = subfolders.map((subfolder) => ({
      key: subfolder,
      search: subfolder.toLowerCase(),
      main: `📁 ${formatLabel(subfolder)}`,
      sub: importEnabled ? "Open subfolder or import its texts" : "Open subfolder",
      active: false,
      secondaryAction: importEnabled
        ? {
            label: "Import texts",
            onClick: () => openImportModal(language, subfolder),
          }
        : null,
    }));

    onCardSelect = (item) => {
      renderFiles(language, item.key);
    };

    renderCards();
  } catch (error) {
    handleError(error, `Could not load subfolders for ${language}.`);
  }
}

async function renderFiles(language, subfolder) {
  state.view = VIEW.FILES;
  state.language = language;
  state.subfolder = subfolder;
  state.file = "";
  syncQueryParams();

  setHeader("Files", `Select a text in ${formatLabel(subfolder)}`, `/${ROOT_FOLDER}/${language}/${subfolder}`);
  toggleBackButton();
  showListMode();
  clearError();

  try {
    const entries = await readDirectory([ROOT_FOLDER, language, subfolder]);
    const files = entries
      .filter((entry) => !entry.isDirectory && entry.name.toLowerCase().endsWith(".txt"))
      .map((entry) => entry.name)
      .sort();

    currentCards = files.map((fileName) => ({
      key: fileName,
      search: fileName.toLowerCase(),
      main: `📄 ${fileName}`,
      sub: "Open text",
      active: fileName === state.file,
      secondaryAction: null,
    }));

    onCardSelect = (item) => {
      renderContent(language, subfolder, item.key);
    };

    renderCards();
  } catch (error) {
    handleError(error, `Could not load files for ${subfolder}.`);
  }
}

async function renderContent(language, subfolder, fileName) {
  state.view = VIEW.CONTENT;
  state.language = language;
  state.subfolder = subfolder;
  state.file = fileName;
  syncQueryParams();

  setHeader("Reader", fileName, `/${ROOT_FOLDER}/${language}/${subfolder}/${fileName}`);
  toggleBackButton();
  showContentMode();
  clearError();

  contentMeta.textContent = `${formatLabel(language)} / ${formatLabel(subfolder)} / ${fileName}`;
  contentArea.textContent = "Loading text...";

  try {
    const text = await readTextFile([ROOT_FOLDER, language, subfolder, fileName]);
    contentArea.textContent = text || "This text file is empty.";
  } catch (error) {
    handleError(error, `Could not load ${fileName}.`);
    const path = `/${ROOT_FOLDER}/${language}/${subfolder}/${fileName}`;
    contentArea.textContent = `Unable to read: ${path}`;
  }
}

async function readDirectory(parts) {
  if (staticTreeIndex) {
    return readDirectoryFromStaticIndex(parts);
  }

  if (githubContext) {
    return readDirectoryFromGitHub(parts);
  }

  return readDirectoryFromHttpListing(parts);
}

async function readTextFile(parts) {
  if (staticTreeIndex) {
    return readTextFileFromStaticIndex(parts);
  }

  if (githubContext) {
    return readTextFileFromGitHub(parts);
  }

  return readTextFileFromHttp(parts);
}

async function readDirectoryFromHttpListing(parts) {
  const dirPath = buildDirectoryPath(parts);
  const dirUrl = new URL(dirPath, window.location.href);
  const cacheKey = `http-dir:${dirUrl.toString()}`;

  if (directoryCache.has(cacheKey)) {
    return directoryCache.get(cacheKey);
  }

  const response = await fetch(dirUrl.toString());
  if (!response.ok) {
    throw new Error(`Failed to load ${dirUrl.toString()} (${response.status})`);
  }

  const html = await response.text();
  const entries = parseDirectoryListing(html, dirUrl);
  directoryCache.set(cacheKey, entries);

  return entries;
}

async function readTextFileFromHttp(parts) {
  const filePath = buildFilePath(parts);
  const fileUrl = new URL(filePath, window.location.href).toString();

  if (fileCache.has(fileUrl)) {
    return fileCache.get(fileUrl);
  }

  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to load ${fileUrl} (${response.status})`);
  }

  const text = await response.text();
  fileCache.set(fileUrl, text);

  return text;
}

async function readDirectoryFromStaticIndex(parts) {
  const cacheKey = `idx-dir:${parts.join("/")}`;
  if (directoryCache.has(cacheKey)) {
    return directoryCache.get(cacheKey);
  }

  const node = getStaticIndexNode(parts);
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    throw new Error(`Index path not found: ${parts.join("/")}`);
  }

  const entries = Object.keys(node)
    .filter((name) => {
      const value = node[name];
      const isDirectory = Boolean(value && typeof value === "object" && !Array.isArray(value));
      return isDirectory || String(name).toLowerCase().endsWith(".txt");
    })
    .map((name) => {
      const value = node[name];
      return {
        name,
        isDirectory: Boolean(value && typeof value === "object" && !Array.isArray(value)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  directoryCache.set(cacheKey, entries);
  return entries;
}

async function readTextFileFromStaticIndex(parts) {
  if (!isIndexedTextFile(parts)) {
    throw new Error(`Index file not found: ${parts.join("/")}`);
  }
  return readTextFileFromHttp(parts);
}

async function readDirectoryFromGitHub(parts) {
  const repoPath = buildRepoPath(parts);
  const cacheKey = `gh-dir:${repoPath}@${githubBranch}`;

  if (directoryCache.has(cacheKey)) {
    return directoryCache.get(cacheKey);
  }

  const payload = await githubContentsRequest(repoPath);
  if (!Array.isArray(payload)) {
    throw new Error("Expected a directory response from GitHub API.");
  }

  const entries = payload
    .filter((item) => item.type === "dir" || item.type === "file")
    .map((item) => ({ name: item.name, isDirectory: item.type === "dir" }));

  directoryCache.set(cacheKey, entries);
  return entries;
}

async function readTextFileFromGitHub(parts) {
  const repoPath = buildRepoPath(parts);
  const cacheKey = `gh-file:${repoPath}@${githubBranch}`;

  if (fileCache.has(cacheKey)) {
    return fileCache.get(cacheKey);
  }

  const payload = await githubContentsRequest(repoPath);

  if (!payload || payload.type !== "file") {
    throw new Error("Expected a file response from GitHub API.");
  }

  let text = "";

  if (payload.encoding === "base64" && typeof payload.content === "string") {
    text = decodeBase64Utf8(payload.content);
  } else if (payload.download_url) {
    const rawResponse = await fetch(payload.download_url);
    if (!rawResponse.ok) {
      throw new Error(`Failed to load raw file (${rawResponse.status}).`);
    }
    text = await rawResponse.text();
  } else {
    throw new Error("GitHub API did not return readable file content.");
  }

  fileCache.set(cacheKey, text);
  return text;
}

async function githubContentsRequest(repoPath) {
  if (!githubContext) {
    throw new Error("GitHub context is not available.");
  }

  let lastError = new Error("GitHub request failed.");

  for (const branch of getBranchCandidates()) {
    const apiUrl =
      `https://api.github.com/repos/${encodeURIComponent(githubContext.owner)}` +
      `/${encodeURIComponent(githubContext.repo)}/contents/${repoPath}?ref=${encodeURIComponent(branch)}`;

    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });

    if (response.ok) {
      githubBranch = branch;
      return response.json();
    }

    let details = "";
    try {
      const payload = await response.json();
      if (payload && payload.message) {
        details = `: ${payload.message}`;
      }
    } catch {
      // Ignore non-JSON responses.
    }

    lastError = new Error(`GitHub API ${response.status}${details}`);

    if (response.status !== 404) {
      break;
    }
  }

  throw lastError;
}

async function loadStaticTreeIndex() {
  try {
    const indexUrl = new URL(STATIC_INDEX_FILE, window.location.href).toString();
    const response = await fetch(indexUrl, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const normalized = normalizeStaticTreeIndex(payload);
    return normalized;
  } catch (error) {
    return null;
  }
}

function normalizeStaticTreeIndex(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const tree = payload.tree;
  if (!tree || typeof tree !== "object" || Array.isArray(tree)) {
    return null;
  }

  return { tree };
}

function getStaticIndexNode(parts) {
  if (!staticTreeIndex || !Array.isArray(parts) || parts[0] !== ROOT_FOLDER) {
    return null;
  }

  let node = staticTreeIndex.tree;
  for (let index = 1; index < parts.length; index += 1) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return null;
    }
    const part = parts[index];
    node = node[part];
  }

  return node;
}

function isIndexedTextFile(parts) {
  if (!Array.isArray(parts) || parts.length < 2) {
    return false;
  }

  const fileName = parts[parts.length - 1];
  const parentNode = getStaticIndexNode(parts.slice(0, -1));
  if (!parentNode || typeof parentNode !== "object" || Array.isArray(parentNode)) {
    return false;
  }

  return parentNode[fileName] === true;
}

function parseDirectoryListing(html, directoryUrl) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const links = Array.from(doc.querySelectorAll("a[href]"));
  const unique = new Set();
  const entries = [];
  const basePath = ensureTrailingSlash(directoryUrl.pathname);

  links.forEach((link) => {
    const rawHref = (link.getAttribute("href") || "").trim();

    if (!rawHref || rawHref === "/" || rawHref === "./" || rawHref === ".." || rawHref === "../") {
      return;
    }

    if (rawHref.startsWith("javascript:") || rawHref.startsWith("mailto:")) {
      return;
    }

    let entryUrl;
    try {
      entryUrl = new URL(rawHref, directoryUrl);
    } catch {
      return;
    }

    if (entryUrl.origin !== directoryUrl.origin) {
      return;
    }

    if (!entryUrl.pathname.startsWith(basePath)) {
      return;
    }

    let relativePath = entryUrl.pathname.slice(basePath.length);
    relativePath = relativePath.replace(/^\/+/, "");

    if (!relativePath) {
      return;
    }

    const segments = relativePath.split("/").filter(Boolean);
    if (segments.length !== 1) {
      return;
    }

    let name = segments[0];
    try {
      name = decodeURIComponent(name);
    } catch {
      // Keep original segment if decoding fails.
    }

    const labelText = (link.textContent || "").trim();
    const isDirectory =
      entryUrl.pathname.endsWith("/") || rawHref.endsWith("/") || labelText.endsWith("/");

    if (!name || name === "." || name === ".." || name.startsWith(".")) {
      return;
    }

    const key = `${name}::${isDirectory}`;
    if (unique.has(key)) {
      return;
    }

    unique.add(key);
    entries.push({ name, isDirectory });
  });

  return entries;
}

function setupImportModal() {
  if (!importModal || !importForm) {
    return;
  }

  if (importConfig.endpoint) {
    importEndpointHint.textContent = `Endpoint: ${importConfig.endpoint}`;
  } else {
    importEndpointHint.textContent = "Import disabled: provide importApiEndpoint in URL params.";
  }

  importAuthFields.hidden = !importConfig.authRequired;
  importEmail.required = importConfig.authRequired;
  importPassword.required = importConfig.authRequired;

  importCancelButton.addEventListener("click", closeImportModal);
  importCloseButton.addEventListener("click", closeImportModal);
  importModal.addEventListener("click", (event) => {
    const target = event.target;
    if (target && target.getAttribute("data-modal-close") === "true") {
      closeImportModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !importModal.hidden) {
      closeImportModal();
    }
  });

  importForm.addEventListener("submit", submitImportFromModal);
}

function openImportModal(language, subfolder) {
  if (!importModal) {
    return;
  }

  if (!importConfig.endpoint) {
    return;
  }

  activeImportTarget = { language, subfolder };
  importTargetLabel.textContent = `Import files from: ${formatLabel(language)} / ${formatLabel(subfolder)}`;
  importTagInput.value = buildDefaultImportTag(subfolder);

  importTerms.checked = false;
  importStatus.hidden = true;
  importStatus.textContent = "";
  importStatus.className = "import-status";
  importLoader.hidden = true;

  if (!importConfig.authRequired) {
    importEmail.value = "";
    importPassword.value = "";
  }

  importModal.hidden = false;

  if (importConfig.authRequired) {
    importEmail.focus();
  } else {
    importTerms.focus();
  }
}

function closeImportModal() {
  if (!importModal) {
    return;
  }

  if (!importLoader.hidden) {
    return;
  }

  importModal.hidden = true;
}

async function submitImportFromModal(event) {
  event.preventDefault();

  if (!importConfig.endpoint) {
    setImportStatus("Import endpoint is missing in URL params.", "error");
    return;
  }

  if (!activeImportTarget.language || !activeImportTarget.subfolder) {
    setImportStatus("Choose a valid subfolder first.", "error");
    return;
  }

  if (!importTerms.checked) {
    setImportStatus("Accept terms and conditions before importing.", "error");
    return;
  }

  const emailValue = importEmail.value.trim();
  const passwordValue = importPassword.value;

  if (importConfig.authRequired && (!emailValue || !passwordValue)) {
    setImportStatus("Email and password are required for this import endpoint.", "error");
    return;
  }

  setImportLoading(true);
  setImportStatus("", "none");

  try {
    const { language, subfolder } = activeImportTarget;
    const tagValue = String(importTagInput.value || "").trim() || buildDefaultImportTag(subfolder);
    const entries = await readDirectory([ROOT_FOLDER, language, subfolder]);
    const fileNames = entries
      .filter((entry) => !entry.isDirectory && entry.name.toLowerCase().endsWith(".txt"))
      .map((entry) => entry.name)
      .sort();

    if (!fileNames.length) {
      throw new Error("This subfolder has no .txt files to import.");
    }

    const formData = new FormData();

    if (importConfig.authRequired) {
      formData.append("email", emailValue);
      formData.append("password", passwordValue);
    }

    formData.append("language", formatLabel(language));
    formData.append("subfolder", subfolder);
    formData.append("tag", tagValue);

    let appendedCount = 0;

    for (const fileName of fileNames) {
      const text = await readTextFile([ROOT_FOLDER, language, subfolder, fileName]);
      if (!String(text || "").trim()) {
        continue;
      }

      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      formData.append("files", blob, fileName);
      appendedCount += 1;
    }

    if (!appendedCount) {
      throw new Error("No readable .txt content found to upload.");
    }

    const response = await fetch(importConfig.endpoint, {
      method: "POST",
      body: formData,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(payload?.error || `Import failed with HTTP ${response.status}.`);
    }

    const importedCount = Number(payload?.createdCount || appendedCount);
    setImportStatus(`Import complete. ${importedCount} file(s) uploaded.`, "success");
  } catch (error) {
    setImportStatus(error.message || "Import failed.", "error");
  } finally {
    setImportLoading(false);
  }
}

function setImportStatus(message, type = "none") {
  if (!importStatus) {
    return;
  }

  if (!message) {
    importStatus.hidden = true;
    importStatus.textContent = "";
    importStatus.className = "import-status";
    return;
  }

  importStatus.hidden = false;
  importStatus.textContent = message;
  importStatus.className = `import-status ${type === "success" ? "success" : "error"}`;
}

function setImportLoading(isLoading) {
  importLoader.hidden = !isLoading;
  importSubmitButton.disabled = isLoading;
  importCancelButton.disabled = isLoading;
  importCloseButton.disabled = isLoading;
}

function getImportConfigFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const endpointRaw = params.get("importApiEndpoint") || params.get("apiEndpoint") || "";
  const authRaw = params.get("importAuthRequired") ?? params.get("authRequired");

  return {
    endpoint: normalizeEndpoint(endpointRaw),
    authRequired: parseBooleanParam(authRaw, true),
  };
}

function buildDefaultImportTag(subfolder) {
  return String(subfolder || "").trim();
}

function parseBooleanParam(value, defaultValue) {
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "required"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function normalizeEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    return new URL(raw, window.location.href).toString();
  } catch {
    return "";
  }
}

function decodeBase64Utf8(base64Text) {
  const cleaned = base64Text.replace(/\n/g, "");
  const binary = atob(cleaned);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function getBranchCandidates() {
  const ordered = [githubBranch, ...BRANCH_FALLBACKS];
  return [...new Set(ordered.filter(Boolean))];
}

async function fetchDefaultBranch(owner, repo) {
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(`Could not detect default branch (${response.status}).`);
  }

  const payload = await response.json();
  return payload.default_branch || "main";
}

function detectGitHubPagesContext() {
  const host = window.location.hostname.toLowerCase();
  if (!host.endsWith(".github.io")) {
    return null;
  }

  const owner = host.replace(/\.github\.io$/, "");
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const repo = pathParts[0] || `${owner}.github.io`;

  return { owner, repo };
}

function ensureTrailingSlash(pathname) {
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function renderCards() {
  cardGrid.innerHTML = "";

  const query = searchInput.value.trim().toLowerCase();
  const visibleCards = currentCards.filter((card) => card.search.includes(query));

  if (!currentCards.length) {
    showPlaceholder("This folder is empty.");
    return;
  }

  if (!visibleCards.length) {
    showPlaceholder("No matching results.");
    return;
  }

  listPlaceholder.hidden = true;

  visibleCards.forEach((card) => {
    const shell = document.createElement("div");
    shell.className = "card-shell";
    shell.setAttribute("role", "listitem");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "card-item";

    if (card.active) {
      button.classList.add("active");
    }

    const main = document.createElement("span");
    main.className = "card-main";

    if (card.flagCode) {
      const flag = document.createElement("span");
      flag.className = `fi fi-${card.flagCode} flag-icon`;
      flag.setAttribute("aria-hidden", "true");
      main.appendChild(flag);
    }

    const label = document.createElement("span");
    label.textContent = card.main;
    main.appendChild(label);

    const sub = document.createElement("span");
    sub.className = "card-sub";
    sub.textContent = card.sub;

    button.appendChild(main);
    button.appendChild(sub);
    button.addEventListener("click", () => onCardSelect(card));

    shell.appendChild(button);

    if (card.secondaryAction) {
      const secondaryButton = document.createElement("button");
      secondaryButton.type = "button";
      secondaryButton.className = "card-secondary";
      secondaryButton.textContent = card.secondaryAction.label;
      secondaryButton.addEventListener("click", (event) => {
        event.stopPropagation();
        card.secondaryAction.onClick();
      });
      shell.appendChild(secondaryButton);
    }

    cardGrid.appendChild(shell);
  });
}

function showPlaceholder(message) {
  cardGrid.innerHTML = "";
  listPlaceholder.textContent = message;
  listPlaceholder.hidden = false;
}

function setHeader(step, title, path) {
  stepLabel.textContent = step;
  viewTitle.textContent = title;
  pathText.textContent = `Path: ${path}`;
}

function showListMode() {
  searchWrap.hidden = false;
  listView.hidden = false;
  contentView.hidden = true;
  searchInput.value = "";
}

function showContentMode() {
  searchWrap.hidden = true;
  listView.hidden = true;
  contentView.hidden = false;
}

function toggleBackButton() {
  backButton.hidden = state.view === VIEW.LANGUAGES;
}

function handleError(error, message) {
  console.error(error);
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function clearError() {
  errorMessage.hidden = true;
  errorMessage.textContent = "";
}

function syncQueryParams() {
  const params = new URLSearchParams(window.location.search);

  params.delete("language");
  params.delete("subfolder");
  params.delete("file");

  if (state.language) {
    params.set("language", state.language);
  }

  if (state.subfolder) {
    params.set("subfolder", state.subfolder);
  }

  if (state.file) {
    params.set("file", state.file);
  }

  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

function sanitizeQueryParam(value, allowSlash = false) {
  if (!value) {
    return "";
  }

  const cleaned = value.trim();
  if (!cleaned) {
    return "";
  }

  const normalized = cleaned.replace(/\\/g, "/");

  if (allowSlash) {
    const compact = normalized.replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
    if (!compact || compact.includes("..")) {
      return "";
    }
    return compact;
  }

  if (normalized.includes("/") || normalized.includes("..")) {
    return "";
  }

  return cleaned;
}

function buildDirectoryPath(parts) {
  const [root, ...rest] = parts;
  const encodedRest = rest.map((part) => encodeURIComponent(part));
  const joined = [root, ...encodedRest].join("/");
  return `${joined}/`;
}

function buildFilePath(parts) {
  const [root, ...rest] = parts;
  const encodedRest = rest.map((part) => encodeURIComponent(part));
  return [root, ...encodedRest].join("/");
}

function buildRepoPath(parts) {
  return parts.map((part) => encodeURIComponent(part)).join("/");
}

function formatLabel(value) {
  return String(value || "")
    .split(/[\/_-]/)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getLanguageFlagCode(language) {
  return LANGUAGE_FLAGS[String(language || "").toLowerCase()] || "";
}

backButton.addEventListener("click", () => {
  if (state.view === VIEW.SUBFOLDERS) {
    renderLanguages();
  } else if (state.view === VIEW.FILES) {
    renderSubfolders(state.language);
  } else if (state.view === VIEW.CONTENT) {
    renderFiles(state.language, state.subfolder);
  }
});

searchInput.addEventListener("input", () => {
  if (state.view === VIEW.CONTENT) {
    return;
  }

  renderCards();
});
