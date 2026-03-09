const searchInput = document.getElementById("searchInput");
const cardGrid = document.getElementById("cardGrid");
const cardsPlaceholder = document.getElementById("cardsPlaceholder");
const stepLabel = document.getElementById("stepLabel");
const stepTitle = document.getElementById("stepTitle");
const stepHint = document.getElementById("stepHint");
const backButton = document.getElementById("backButton");
const contentArea = document.getElementById("contentArea");

const selectedLanguage = document.getElementById("selectedLanguage");
const selectedSubfolder = document.getElementById("selectedSubfolder");
const selectedFile = document.getElementById("selectedFile");

const LANGUAGE_FLAGS = {
  english: "🇬🇧",
  arabic: "🇸🇦",
  french: "🇫🇷",
  german: "🇩🇪",
  spanish: "🇪🇸",
  italian: "🇮🇹",
  portuguese: "🇵🇹",
  chinese: "🇨🇳",
  japanese: "🇯🇵",
  turkish: "🇹🇷",
};

const STEP = {
  language: "language",
  subfolder: "subfolder",
  text: "text",
};

let textIndex = {};
let currentStep = STEP.language;
let languageValue = "";
let subfolderValue = "";
let fileValue = "";

window.addEventListener("DOMContentLoaded", init);

async function init() {
  stepHint.textContent = "Loading text index...";

  try {
    const response = await fetch("texts/index.json");
    if (!response.ok) {
      throw new Error(`Failed to load index (HTTP ${response.status})`);
    }

    textIndex = await response.json();
    renderCurrentStep();
  } catch (error) {
    console.error(error);
    showPlaceholder("Could not load texts/index.json.");
    stepHint.textContent = "Make sure the site runs through a static server.";
    contentArea.textContent = "Unable to load index data.";
  }
}

function renderCurrentStep() {
  searchInput.value = "";

  if (currentStep === STEP.language) {
    renderLanguageStep();
  } else if (currentStep === STEP.subfolder) {
    renderSubfolderStep();
  } else {
    renderTextStep();
  }

  updateBackButton();
}

function renderLanguageStep() {
  stepLabel.textContent = "Step 1 of 3";
  stepTitle.textContent = "Select a language";
  stepHint.textContent = "Choose a language card to continue.";

  const languages = Object.keys(textIndex).sort();

  renderCards(
    languages,
    (language) => {
      const totalTexts = countTextsByLanguage(language);
      return {
        key: language,
        main: `${getLanguageFlag(language)} ${language}`,
        sub: `${totalTexts} text${totalTexts === 1 ? "" : "s"}`,
        active: language === languageValue,
      };
    },
    (language) => {
      languageValue = language;
      subfolderValue = "";
      fileValue = "";

      selectedLanguage.textContent = language;
      selectedSubfolder.textContent = "None";
      selectedFile.textContent = "None";
      contentArea.textContent = "Select a text card in step 3 to read content here.";

      currentStep = STEP.subfolder;
      renderCurrentStep();
    }
  );
}

function renderSubfolderStep() {
  stepLabel.textContent = "Step 2 of 3";
  stepTitle.textContent = `Select a category in ${languageValue}`;
  stepHint.textContent = "Choose a category card to see text titles.";

  const subfolders = Object.keys(textIndex[languageValue] || {}).sort();

  renderCards(
    subfolders,
    (subfolder) => {
      const totalTexts = (textIndex[languageValue][subfolder] || []).length;
      return {
        key: subfolder,
        main: `📁 ${subfolder}`,
        sub: `${totalTexts} file${totalTexts === 1 ? "" : "s"}`,
        active: subfolder === subfolderValue,
      };
    },
    (subfolder) => {
      subfolderValue = subfolder;
      fileValue = "";

      selectedSubfolder.textContent = subfolder;
      selectedFile.textContent = "None";
      contentArea.textContent = "Select a text card in step 3 to read content here.";

      currentStep = STEP.text;
      renderCurrentStep();
    }
  );
}

function renderTextStep() {
  stepLabel.textContent = "Step 3 of 3";
  stepTitle.textContent = `Texts in ${subfolderValue}`;
  stepHint.textContent = "Pick a text card to load and read the content.";

  const files = (textIndex[languageValue]?.[subfolderValue] || []).filter((name) =>
    name.toLowerCase().endsWith(".txt")
  );

  renderCards(
    files,
    (fileName) => ({
      key: fileName,
      main: `📄 ${fileName}`,
      sub: "Open text",
      active: fileName === fileValue,
    }),
    (fileName) => {
      loadTextFile(fileName);
    }
  );
}

function renderCards(items, mapper, onCardClick) {
  cardGrid.innerHTML = "";

  const query = searchInput.value.trim().toLowerCase();
  const visibleItems = items.filter((item) => item.toLowerCase().includes(query));

  if (items.length === 0) {
    showPlaceholder("This step has no items.");
    return;
  }

  if (visibleItems.length === 0) {
    showPlaceholder("No results for your search.");
    return;
  }

  cardsPlaceholder.hidden = true;

  visibleItems.forEach((item) => {
    const view = mapper(item);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "card-item";
    button.setAttribute("role", "listitem");

    if (view.active) {
      button.classList.add("active");
    }

    const main = document.createElement("span");
    main.className = "card-main";
    main.textContent = view.main;

    const sub = document.createElement("span");
    sub.className = "card-sub";
    sub.textContent = view.sub;

    button.appendChild(main);
    button.appendChild(sub);
    button.addEventListener("click", () => onCardClick(view.key));

    cardGrid.appendChild(button);
  });
}

function showPlaceholder(message) {
  cardGrid.innerHTML = "";
  cardsPlaceholder.textContent = message;
  cardsPlaceholder.hidden = false;
}

async function loadTextFile(fileName) {
  fileValue = fileName;
  selectedFile.textContent = fileName;
  contentArea.textContent = "Loading text...";

  renderTextStep();

  const path = `texts/${encodeURIComponent(languageValue)}/${encodeURIComponent(subfolderValue)}/${encodeURIComponent(fileName)}`;

  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load file (HTTP ${response.status})`);
    }

    const text = await response.text();
    contentArea.textContent = text || "This text file is empty.";
  } catch (error) {
    console.error(error);
    contentArea.textContent = `Could not load "${fileName}".\nExpected path: ${decodeURIComponent(path)}`;
  }
}

function getLanguageFlag(language) {
  return LANGUAGE_FLAGS[language.toLowerCase()] || "🌐";
}

function countTextsByLanguage(language) {
  const subfolders = Object.values(textIndex[language] || {});
  return subfolders.reduce((total, files) => total + files.length, 0);
}

function updateBackButton() {
  backButton.hidden = currentStep === STEP.language;
}

backButton.addEventListener("click", () => {
  if (currentStep === STEP.subfolder) {
    currentStep = STEP.language;
    subfolderValue = "";
    fileValue = "";
    selectedSubfolder.textContent = "None";
    selectedFile.textContent = "None";
    contentArea.textContent = "Select a text card in step 3 to read content here.";
  } else if (currentStep === STEP.text) {
    currentStep = STEP.subfolder;
    fileValue = "";
    selectedFile.textContent = "None";
    contentArea.textContent = "Select a text card in step 3 to read content here.";
  }

  renderCurrentStep();
});

searchInput.addEventListener("input", () => {
  if (currentStep === STEP.language) {
    renderLanguageStep();
  } else if (currentStep === STEP.subfolder) {
    renderSubfolderStep();
  } else {
    renderTextStep();
  }
});
