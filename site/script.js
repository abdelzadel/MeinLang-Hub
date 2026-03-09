const languageSelect = document.getElementById("languageSelect");
const subfolderSelect = document.getElementById("subfolderSelect");
const searchInput = document.getElementById("searchInput");
const fileList = document.getElementById("fileList");
const listPlaceholder = document.getElementById("listPlaceholder");
const contentArea = document.getElementById("contentArea");

const selectedLanguage = document.getElementById("selectedLanguage");
const selectedSubfolder = document.getElementById("selectedSubfolder");
const selectedFile = document.getElementById("selectedFile");

let textIndex = {};
let currentFiles = [];
let activeFileName = "";

const PLACEHOLDER_MESSAGES = {
  startup: "Loading text index...",
  selectLanguage: "Select a language and category to see available texts.",
  selectCategory: "Select a category to list texts.",
  noTexts: "No text files found in this category.",
  noSearchMatch: "No texts match your search.",
};

// Load the index once on startup.
window.addEventListener("DOMContentLoaded", init);

async function init() {
  setListPlaceholder(PLACEHOLDER_MESSAGES.startup);

  try {
    const response = await fetch("texts/index.json");
    if (!response.ok) {
      throw new Error(`Failed to load index (HTTP ${response.status})`);
    }

    textIndex = await response.json();
    populateLanguages(Object.keys(textIndex));
    setListPlaceholder(PLACEHOLDER_MESSAGES.selectLanguage);
  } catch (error) {
    console.error(error);
    setListPlaceholder("Could not load text index. Check that texts/index.json exists.");
    contentArea.textContent = "Unable to load data. Try refreshing or running with a static server.";
  }
}

function populateLanguages(languages) {
  resetSelect(subfolderSelect, "Select a category");
  languageSelect.innerHTML = '<option value="">Select a language</option>';

  languages.sort().forEach((language) => {
    languageSelect.appendChild(new Option(language, language));
  });

  languageSelect.disabled = languages.length === 0;
}

function populateSubfolders(language) {
  resetSelect(subfolderSelect, "Select a category");

  if (!language || !textIndex[language]) {
    subfolderSelect.disabled = true;
    searchInput.disabled = true;
    searchInput.value = "";
    clearFiles(PLACEHOLDER_MESSAGES.selectLanguage);
    return;
  }

  const subfolders = Object.keys(textIndex[language]).sort();
  subfolders.forEach((subfolder) => {
    subfolderSelect.appendChild(new Option(subfolder, subfolder));
  });

  subfolderSelect.disabled = false;
  searchInput.disabled = true;
  searchInput.value = "";
  clearFiles(PLACEHOLDER_MESSAGES.selectCategory);
}

function renderFiles(files, searchTerm = "") {
  fileList.innerHTML = "";

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleFiles = files.filter((name) => name.toLowerCase().includes(normalizedSearch));

  if (!files.length) {
    setListPlaceholder(PLACEHOLDER_MESSAGES.noTexts);
    return;
  }

  if (!visibleFiles.length) {
    setListPlaceholder(PLACEHOLDER_MESSAGES.noSearchMatch);
    return;
  }

  listPlaceholder.hidden = true;

  visibleFiles.forEach((fileName) => {
    const item = document.createElement("li");
    item.className = "file-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-link";
    button.textContent = fileName;

    if (fileName === activeFileName) {
      button.classList.add("active");
    }

    button.addEventListener("click", () => {
      loadTextFile(fileName);
    });

    item.appendChild(button);
    fileList.appendChild(item);
  });
}

async function loadTextFile(fileName) {
  const language = languageSelect.value;
  const subfolder = subfolderSelect.value;

  if (!language || !subfolder || !fileName) {
    return;
  }

  activeFileName = fileName;
  selectedFile.textContent = fileName;
  contentArea.textContent = "Loading text...";
  renderFiles(currentFiles, searchInput.value);

  const path = `texts/${encodeURIComponent(language)}/${encodeURIComponent(subfolder)}/${encodeURIComponent(fileName)}`;

  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load file (HTTP ${response.status})`);
    }

    const text = await response.text();
    contentArea.textContent = text || "This text file is empty.";
  } catch (error) {
    console.error(error);
    contentArea.textContent = `Could not load "${fileName}". Please verify the file exists at:\n${decodeURIComponent(path)}`;
  }
}

function clearFiles(message) {
  currentFiles = [];
  activeFileName = "";
  fileList.innerHTML = "";
  setListPlaceholder(message);
  selectedFile.textContent = "None";
}

function setListPlaceholder(message) {
  listPlaceholder.textContent = message;
  listPlaceholder.hidden = false;
}

function resetSelect(selectElement, firstOptionText) {
  selectElement.innerHTML = "";
  selectElement.appendChild(new Option(firstOptionText, ""));
}

languageSelect.addEventListener("change", () => {
  const language = languageSelect.value;
  selectedLanguage.textContent = language || "None";
  selectedSubfolder.textContent = "None";
  selectedFile.textContent = "None";
  contentArea.textContent = "Select a text to read its content here.";

  populateSubfolders(language);
});

subfolderSelect.addEventListener("change", () => {
  const language = languageSelect.value;
  const subfolder = subfolderSelect.value;

  selectedSubfolder.textContent = subfolder || "None";
  selectedFile.textContent = "None";
  contentArea.textContent = "Select a text to read its content here.";
  activeFileName = "";

  if (!language || !subfolder) {
    searchInput.disabled = true;
    searchInput.value = "";
    clearFiles(PLACEHOLDER_MESSAGES.selectCategory);
    return;
  }

  searchInput.disabled = false;
  searchInput.value = "";
  currentFiles = (textIndex[language][subfolder] || []).filter((name) => name.endsWith(".txt"));
  renderFiles(currentFiles);
});

searchInput.addEventListener("input", () => {
  renderFiles(currentFiles, searchInput.value);
});
