const STORAGE_KEY = "clothing-decks";
const IMAGE_GALLERY_KEY = "clothing-image-gallery";
const FAVORITE_HEART_COLOR_KEY = "favorite-heart-color";
const PENDING_IMAGE_SELECTION_KEY = "clothing-pending-image-selection";
const PENDING_IMAGE_TARGET_KEY = "clothing-pending-image-target";
const IMAGE_DATABASE_NAME = "the-closet-images";
const IMAGE_STORE_NAME = "images";
const TAGS_KEY = "clothing-item-tags";
const OUTFIT_BOARD_KEY = "clothing-outfit-board";
const FAVORITE_OUTFITS_KEY = "clothing-favorite-outfits";
let deckNames = ["shirts", "pants", "shoes"];
let menuButton = document.getElementById("menu-button");
let sidebarBackdrop = document.getElementById("sidebar-backdrop");
let sidebar = document.getElementById("sidebar");
let sidebarClose = document.getElementById("sidebar-close");
let menuFavorites = document.getElementById("menu-favorites");
let menuGallery = document.getElementById("menu-gallery");
let menuOutfit = document.getElementById("menu-outfit");
const defaultDecks = {
  shirts: ["T-shirt", "Button-up"],
  pants: ["Jeans", "Shorts"],
  shoes: ["Sneakers", "Boots"]
};

let collapsedDecks = { shirts: false, pants: false, shoes: false };

function isImageUrl(value) {
  return /^https?:\/\//i.test(value);
}

function isDataUrl(value) {
  return /^data:image\//i.test(value);
}

function isImageEntry(value) {
  return typeof value === "object" && value !== null && (typeof value.src === "string" || typeof value.imageId === "string");
}

let imageDatabasePromise = null;

function openImageDatabase() {
  if (imageDatabasePromise) {
    return imageDatabasePromise;
  }

  imageDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(IMAGE_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        request.result.createObjectStore(IMAGE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return imageDatabasePromise;
}

async function storeImageData(dataUrl) {
  const database = await openImageDatabase();
  const imageId = crypto.randomUUID();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(IMAGE_STORE_NAME, "readwrite");
    transaction.objectStore(IMAGE_STORE_NAME).put(dataUrl, imageId);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  return imageId;
}

async function getStoredImage(imageId) {
  const database = await openImageDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(IMAGE_STORE_NAME, "readonly");
    const request = transaction.objectStore(IMAGE_STORE_NAME).get(imageId);
    request.onsuccess = () => resolve(request.result || "");
    request.onerror = () => reject(request.error);
  });
}

async function getImageSource(item) {
  if (typeof item === "string") {
    return item;
  }
  if (item && typeof item.src === "string") {
    return item.src;
  }
  if (item && typeof item.imageId === "string") {
    return getStoredImage(item.imageId);
  }
  return "";
}

function hydrateStoredImage(image, item) {
  getImageSource(item)
    .then((src) => {
      if (src) image.src = src;
    })
    .catch((error) => console.error("Could not load image:", error));
}

function addImageInteractions(image, primaryImage, secondImage) {
  let clickTimer = null;
  let showingSecondImage = false;

  image.addEventListener("click", () => {
    if (clickTimer) {
      clearTimeout(clickTimer);
    }
    clickTimer = setTimeout(async () => {
      clickTimer = null;
      const displayedImage = showingSecondImage && secondImage ? secondImage : primaryImage;
      const alternateImage = showingSecondImage ? primaryImage : secondImage;
      const [source, alternateSource] = await Promise.all([
        getImageSource(displayedImage),
        alternateImage ? getImageSource(alternateImage) : Promise.resolve("")
      ]);
      if (source) openViewer(source, alternateSource);
    }, 250);
  });

  if (secondImage) {
    image.classList.add("has-second-image");
    image.title = "Double-click to switch photos";
    image.addEventListener("dblclick", async () => {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      showingSecondImage = !showingSecondImage;
      const source = await getImageSource(showingSecondImage ? secondImage : primaryImage);
      if (source) image.src = source;
    });
  }
}

function escapeHtmlAttribute(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isTextObject(value) {
  return typeof value === "object" && value !== null && typeof value.text === "string";
}

function getItemLabel(item) {
  if (isTextObject(item)) {
    return item.text;
  }

  if (isImageEntry(item)) {
    return item.name || "";
  }

  if (typeof item === "string") {
    return item;
  }

  return "";
}

function formatCategoryName(deckName) {
  return deckName
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function renameCategoryInMemory(currentName, requestedName) {
  const nextName = requestedName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  if (!currentName || !decks[currentName] || !nextName || nextName === currentName) {
    return nextName === currentName;
  }

  if (decks[nextName] || deckNames.includes(nextName)) {
    return false;
  }

  decks[nextName] = decks[currentName];
  delete decks[currentName];
  collapsedDecks[nextName] = Boolean(collapsedDecks[currentName]);
  delete collapsedDecks[currentName];
  deckNames[deckNames.indexOf(currentName)] = nextName;
  return true;
}

function isItemFavorite(item) {
  return typeof item === "object" && item !== null && Boolean(item.favorite);
}

function setItemFavorite(item, favorite) {
  if (isImageEntry(item)) {
    return { ...item, favorite };
  }

  if (isImageUrl(item) || isDataUrl(item)) {
    return { src: item, name: "", favorite };
  }

  if (typeof item === "string") {
    return { text: item, favorite };
  }

  if (typeof item === "object" && item !== null) {
    return { ...item, favorite };
  }

  return item;
}

function itemMatchesSearch(item, searchQuery, searchType = "contains") {
  const label = getItemLabel(item).trim().toLowerCase();
  const query = searchQuery.trim().toLowerCase();
  return searchType === "starts-with" ? label.startsWith(query) : label.includes(query);
}

let decks = loadDecks();
let imageViewer = document.getElementById("image-viewer");
let viewerImage = document.getElementById("viewer-image");
let viewerAlternateImageSrc = "";
let editButton = document.getElementById("edit-button");
let addCategoryButton = document.getElementById("add-category-button");
let editStatus = document.getElementById("edit-status");
let editDots = document.getElementById("edit-dots");
let appShell = document.querySelector(".app-shell");
let editMode = false;
let dotAnimationTimer = null;
let draggedItem = null;
let draggedDeck = null;
let closetSearchQuery = "";
let favoritesSearchQuery = "";
let closetSearchType = "contains";
let favoritesSearchType = "contains";
let closetTags = loadTags();
let outfitBoardItems = loadOutfitBoard();
let favoriteOutfits = loadFavoriteOutfits();
const deleteConfirmation = document.getElementById("delete-confirmation");
const confirmDeleteButton = document.getElementById("confirm-delete-button");
const cancelDeleteButton = document.getElementById("cancel-delete-button");
let pendingDeckDelete = null;

function setEditMode(isActive) {
  editMode = isActive;
  const editBtn = document.getElementById("edit-button");
  const addCatBtn = document.getElementById("add-category-button");
  const status = document.getElementById("edit-status");
  const dots = document.getElementById("edit-dots");
  const shell = document.querySelector(".app-shell");
  const menuBtn = document.getElementById("menu-button");

  if (editBtn) {
    editBtn.textContent = isActive ? "Finish" : "Edit";
    editBtn.classList.toggle("active", isActive);
  }

  if (status) {
    status.classList.toggle("active", isActive);
  }

  document.querySelectorAll(".deck").forEach((deck) => {
    deck.classList.toggle("edit-mode", isActive);
  });

  if (menuBtn) {
    menuBtn.classList.toggle("hidden", isActive);
  }

  if (addCatBtn) {
    addCatBtn.classList.toggle("hidden", !isActive);
  }

  if (shell) {
    shell.classList.toggle("editing", isActive);
  }

  if (!isActive) {
    closeDeleteConfirmation();
  }

  renderDecks();

  if (dotAnimationTimer) {
    clearInterval(dotAnimationTimer);
    dotAnimationTimer = null;
  }

  if (isActive) {
    const sequence = [".", "..", "...", " "];
    let dotIndex = 0;
    const dots = document.getElementById("edit-dots");
    if (dots) {
      dots.textContent = sequence[0];
    }

    dotAnimationTimer = setInterval(() => {
      dotIndex = (dotIndex + 1) % sequence.length;
      const dotsInInterval = document.getElementById("edit-dots");
      if (dotsInInterval) {
        dotsInInterval.textContent = sequence[dotIndex];
      }
    }, 500);
  } else {
    const dots = document.getElementById("edit-dots");
    if (dots) {
      dots.textContent = ".";
    }
  }
}

function saveEditedNames() {
  document.querySelectorAll(".name-edit-input").forEach((input) => {
    const deckName = input.dataset.deck;
    const index = Number(input.dataset.index);

    if (!decks[deckName] || !Number.isInteger(index)) {
      return;
    }

    const nextValue = input.value.trim();
    const item = decks[deckName][index];

    if (typeof item === "string") {
      if (isImageUrl(item) || isDataUrl(item)) {
        decks[deckName][index] = { src: item, name: nextValue };
      } else {
        decks[deckName][index] = nextValue;
      }
    } else if (isTextObject(item)) {
      decks[deckName][index] = { ...item, text: nextValue };
    } else if (isImageEntry(item)) {
      decks[deckName][index] = { ...item, name: nextValue };
    } else if (typeof item === "object" && item !== null) {
      decks[deckName][index] = { ...item, text: nextValue };
    }
  });

  document.querySelectorAll(".deck-name-input").forEach((input) => {
    const currentName = input.dataset.deck;
    const requestedName = input.value.trim();
    if (!renameCategoryInMemory(currentName, requestedName) && requestedName) {
      input.value = formatCategoryName(currentName);
    }
  });

  saveDecks();
}

function handleDragStart(event) {
  const row = event.currentTarget;
  if (!editMode || !row.dataset.deck || row.dataset.index === undefined) {
    return;
  }

  draggedItem = { deck: row.dataset.deck, index: Number(row.dataset.index) };
  row.classList.add("dragging");

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${draggedItem.deck}:${draggedItem.index}`);
  }
}

function handleDragOver(event) {
  const row = event.currentTarget;
  if (!editMode || !draggedItem || row.dataset.deck !== draggedItem.deck) {
    return;
  }

  event.preventDefault();
  row.classList.add("drag-over");
}

function handleDragLeave(event) {
  event.currentTarget.classList.remove("drag-over");
}

function handleDrop(event) {
  const row = event.currentTarget;
  if (!editMode || !draggedItem || row.dataset.deck !== draggedItem.deck) {
    return;
  }

  event.preventDefault();
  const sourceIndex = draggedItem.index;
  const targetIndex = Number(row.dataset.index);

  if (Number.isInteger(targetIndex) && sourceIndex !== targetIndex) {
    const items = decks[draggedItem.deck];
    const [movedItem] = items.splice(sourceIndex, 1);
    const adjustedTargetIndex = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
    items.splice(adjustedTargetIndex, 0, movedItem);
    saveDecks();
    renderDecks();
  }

  draggedItem = null;
  document.querySelectorAll("li").forEach((item) => {
    item.classList.remove("dragging", "drag-over");
  });
}

function handleDragEnd(event) {
  event.currentTarget.classList.remove("dragging", "drag-over");
  draggedItem = null;
  document.querySelectorAll("li").forEach((item) => {
    item.classList.remove("dragging", "drag-over");
  });
}

function handleDeckDragStart(event) {
  const section = event.currentTarget;
  if (!editMode || !section.dataset.deck || !collapsedDecks[section.dataset.deck]) {
    return;
  }

  draggedDeck = section.dataset.deck;
  section.classList.add("dragging");

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `deck:${draggedDeck}`);
  }
}

function handleDeckDragOver(event) {
  const section = event.currentTarget;
  if (!editMode || !draggedDeck || section.dataset.deck === draggedDeck) {
    return;
  }

  event.preventDefault();
  section.classList.add("drag-over");
}

function handleDeckDragLeave(event) {
  event.currentTarget.classList.remove("drag-over");
}

function handleDeckDrop(event) {
  const section = event.currentTarget;
  if (!editMode || !draggedDeck || section.dataset.deck === draggedDeck) {
    return;
  }

  event.preventDefault();
  const sourceDeck = draggedDeck;
  const targetDeck = section.dataset.deck;
  const sourceIndex = deckNames.indexOf(sourceDeck);
  const targetIndex = deckNames.indexOf(targetDeck);

  if (sourceIndex !== -1 && targetIndex !== -1 && sourceIndex !== targetIndex) {
    deckNames.splice(sourceIndex, 1);
    deckNames.splice(targetIndex, 0, sourceDeck);
    saveDecks();
    renderDecks();
  }

  draggedDeck = null;
  document.querySelectorAll(".deck").forEach((item) => {
    item.classList.remove("dragging", "drag-over");
  });
}

function handleDeckDragEnd(event) {
  event.currentTarget.classList.remove("dragging", "drag-over");
  draggedDeck = null;
  document.querySelectorAll(".deck").forEach((item) => {
    item.classList.remove("dragging", "drag-over");
  });
}

function loadDecks() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { ...defaultDecks };
  }

  try {
    const parsed = JSON.parse(raw);
    const loadedDecks = Object.keys(parsed).reduce((acc, key) => {
      if (key === "deckOrder" || key === "collapsedDecks") {
        return acc;
      }

      if (Array.isArray(parsed[key])) {
        acc[key] = parsed[key];
      }
      return acc;
    }, {});

    if (parsed && Array.isArray(parsed.deckOrder)) {
      const validOrder = parsed.deckOrder.filter((name) => typeof name === "string" && name in loadedDecks);
      if (validOrder.length) {
        deckNames = validOrder;
      }
    } else if (Object.keys(loadedDecks).length) {
      deckNames = Object.keys(loadedDecks);
    }

    if (parsed && typeof parsed.collapsedDecks === "object" && parsed.collapsedDecks !== null) {
      collapsedDecks = Object.keys(parsed.collapsedDecks).reduce((acc, key) => {
        if (typeof key === "string") {
          acc[key] = Boolean(parsed.collapsedDecks[key]);
        }
        return acc;
      }, {});
    }

    return Object.keys(loadedDecks).length ? loadedDecks : { ...defaultDecks };
  } catch {
    return { ...defaultDecks };
  }
}

function saveDecks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...decks,
      deckOrder: deckNames,
      collapsedDecks
    }));
    return true;
  } catch (error) {
    console.error("Could not save closet data:", error);
    return false;
  }
}

function openDeleteConfirmation(deckName) {
  pendingDeckDelete = deckName;
  const deleteConfirmationElement = document.getElementById("delete-confirmation");
  if (deleteConfirmationElement) {
    deleteConfirmationElement.classList.remove("hidden");
  }
}

function closeDeleteConfirmation() {
  pendingDeckDelete = null;
  const deleteConfirmationElement = document.getElementById("delete-confirmation");
  if (deleteConfirmationElement) {
    deleteConfirmationElement.classList.add("hidden");
  }
}

function confirmDeleteDeck() {
  if (!pendingDeckDelete) {
    return;
  }

  const deckName = pendingDeckDelete;
  pendingDeckDelete = null;

  if (deckName in decks) {
    delete decks[deckName];
  }

  delete collapsedDecks[deckName];
  deckNames = deckNames.filter((name) => name !== deckName);
  saveDecks();
  closeDeleteConfirmation();
  renderDecks();
}

function loadGallery() {
  const raw = localStorage.getItem(IMAGE_GALLERY_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGallery(images) {
  const existing = loadGallery();
  const uniqueImages = [...existing, ...images].filter((image, index, allImages) => {
    const key = typeof image === "string" ? image : image?.imageId;
    return key && allImages.findIndex((candidate) => (typeof candidate === "string" ? candidate : candidate?.imageId) === key) === index;
  });
  try {
    localStorage.setItem(IMAGE_GALLERY_KEY, JSON.stringify(uniqueImages));
    return true;
  } catch (error) {
    console.error("Could not save gallery images:", error);
    return false;
  }
}

function replaceGallery(images) {
  try {
    localStorage.setItem(IMAGE_GALLERY_KEY, JSON.stringify(images));
    return true;
  } catch (error) {
    console.error("Could not update gallery images:", error);
    return false;
  }
}

async function moveExistingPhotosToImageStorage() {
  let galleryChanged = false;
  let decksChanged = false;
  const gallery = loadGallery();

  const updatedGallery = await Promise.all(gallery.map(async (image) => {
    if (typeof image === "string" && isDataUrl(image)) {
      galleryChanged = true;
      return { imageId: await storeImageData(image) };
    }
    return image;
  }));

  for (const deckName of Object.keys(decks)) {
    decks[deckName] = await Promise.all(decks[deckName].map(async (item) => {
      if (typeof item === "string" && isDataUrl(item)) {
        decksChanged = true;
        return { imageId: await storeImageData(item), name: "", favorite: false };
      }
      if (isImageEntry(item) && typeof item.src === "string" && isDataUrl(item.src)) {
        decksChanged = true;
        const { src, ...details } = item;
        return { ...details, imageId: await storeImageData(src) };
      }
      return item;
    }));
  }

  if (galleryChanged) {
    replaceGallery(updatedGallery);
  }
  if (decksChanged) {
    saveDecks();
  }
}

function loadFavoriteHeartColor() {
  const color = localStorage.getItem(FAVORITE_HEART_COLOR_KEY);
  return color || "#d43d4a";
}

function saveFavoriteHeartColor(color) {
  localStorage.setItem(FAVORITE_HEART_COLOR_KEY, color);
}

function loadTags() {
  try {
    const tags = JSON.parse(localStorage.getItem(TAGS_KEY));
    return Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string" && tag.trim()) : [];
  } catch {
    return [];
  }
}

function saveTags() {
  localStorage.setItem(TAGS_KEY, JSON.stringify(closetTags));
}

function loadOutfitBoard() {
  try {
    const items = JSON.parse(localStorage.getItem(OUTFIT_BOARD_KEY));
    return Array.isArray(items) ? items.filter((item) => item && (item.src || item.imageId)) : [];
  } catch {
    return [];
  }
}

function saveOutfitBoard() {
  localStorage.setItem(OUTFIT_BOARD_KEY, JSON.stringify(outfitBoardItems));
}

function loadFavoriteOutfits() {
  try {
    const outfits = JSON.parse(localStorage.getItem(FAVORITE_OUTFITS_KEY));
    return Array.isArray(outfits) ? outfits.filter((outfit) => Array.isArray(outfit?.items)) : [];
  } catch {
    return [];
  }
}

function saveFavoriteOutfits() {
  localStorage.setItem(FAVORITE_OUTFITS_KEY, JSON.stringify(favoriteOutfits));
}

function applyFavoriteHeartColor(color = loadFavoriteHeartColor()) {
  document.documentElement.style.setProperty("--favorite-heart-color", color);
}

function clearFavoritesSearch() {
  favoritesSearchQuery = "";
  favoritesSearchType = "contains";
}

function clearClosetSearch() {
  closetSearchQuery = "";
  closetSearchType = "contains";
}

function ensureGalleryImage(src) {
  if (!src) {
    return;
  }

  const existing = loadGallery();
  if (!existing.includes(src)) {
    saveGallery([...existing, src]);
  }
}

function savePendingSelection(selection) {
  localStorage.setItem(PENDING_IMAGE_SELECTION_KEY, JSON.stringify(selection));
}

function loadPendingSelection() {
  const raw = localStorage.getItem(PENDING_IMAGE_SELECTION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.src && parsed.deck ? parsed : null;
  } catch {
    return null;
  }
}

function clearPendingSelection() {
  localStorage.removeItem(PENDING_IMAGE_SELECTION_KEY);
}

function savePendingImageTarget(target) {
  localStorage.setItem(PENDING_IMAGE_TARGET_KEY, JSON.stringify(target));
}

function loadPendingImageTarget() {
  const raw = localStorage.getItem(PENDING_IMAGE_TARGET_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.deck && Number.isInteger(parsed.index) ? parsed : null;
  } catch {
    return null;
  }
}

function clearPendingImageTarget() {
  localStorage.removeItem(PENDING_IMAGE_TARGET_KEY);
}

function applyPendingSelection() {
  const selection = loadPendingSelection();
  if (!selection) {
    return;
  }

  const form = document.querySelector(`.item-form[data-deck="${selection.deck}"]`);
  if (!form) {
    return;
  }

  const input = form.querySelector("input[type='text']");
  if (input) {
    input.value = selection.src;
    input.focus();
  }

  clearPendingSelection();
}

function createDeckSection(deckName) {
  const section = document.createElement("section");
  section.className = "deck";
  section.dataset.deck = deckName;
  section.innerHTML = `
    <div class="deck-header">
      <h2></h2>
      <div class="header-actions">
        <button type="button" class="collapse-toggle" data-deck="${deckName}">Collapse</button>
        <button type="button" class="delete-deck-button" data-deck="${deckName}">🗑</button>
      </div>
    </div>
    <div class="collapsed-note"></div>
    <ul></ul>
    <form class="item-form" data-deck="${deckName}">
      <input type="text" placeholder="Type text" />
      <button type="submit">Add</button>
    </form>
  `;
  return section;
}

function ensureDeckSection(deckName) {
  let section = document.querySelector(`.deck[data-deck="${deckName}"]`);
  if (!section) {
    section = createDeckSection(deckName);
  }

  if (!section.dataset.listenersAdded) {
    section.addEventListener("dragstart", handleDeckDragStart);
    section.addEventListener("dragover", handleDeckDragOver);
    section.addEventListener("dragleave", handleDeckDragLeave);
    section.addEventListener("drop", handleDeckDrop);
    section.addEventListener("dragend", handleDeckDragEnd);
    section.dataset.listenersAdded = "true";
  }

  return section;
}

function renderDecks() {
  const deckGrid = document.querySelector(".deck-grid");
  const searchInput = document.getElementById("closet-search");
  const searchTypeInput = document.getElementById("closet-search-type");
  const searchEmptyMessage = document.getElementById("closet-search-empty");
  const searchQuery = closetSearchQuery.trim();
  let visibleItemCount = 0;
  deckGrid.innerHTML = "";

  if (searchInput) {
    searchInput.value = closetSearchQuery;
  }
  if (searchTypeInput) {
    searchTypeInput.value = closetSearchType;
  }

  deckNames.forEach((deckName) => {
    const matchingItems = searchQuery
      ? decks[deckName].map((item, index) => ({ item, index })).filter(({ item }) => itemMatchesSearch(item, searchQuery, closetSearchType))
      : decks[deckName].map((item, index) => ({ item, index }));

    if (searchQuery && matchingItems.length === 0) {
      return;
    }

    visibleItemCount += matchingItems.length;
    const section = ensureDeckSection(deckName);
    if (!section) {
      return;
    }

    section.classList.toggle("edit-mode", editMode);
    deckGrid.appendChild(section);

    const list = section.querySelector("ul");
    const toggle = section.querySelector(".collapse-toggle");
    const collapsedNote = section.querySelector(".collapsed-note");

    section.classList.toggle("collapsed", collapsedDecks[deckName]);
    section.draggable = editMode && collapsedDecks[deckName];

    if (toggle) {
      toggle.textContent = collapsedDecks[deckName] ? "\u25B2" : "\u25BC";
      toggle.setAttribute("aria-label", collapsedDecks[deckName] ? "Expand category" : "Collapse category");
    }

    const header = section.querySelector("h2");
    if (header) {
      const title = formatCategoryName(deckName);
      if (editMode) {
        const nameInput = document.createElement("input");
        nameInput.className = "deck-name-input";
        nameInput.type = "text";
        nameInput.value = title;
        nameInput.dataset.deck = deckName;
        nameInput.setAttribute("aria-label", `Category name: ${title}`);
        nameInput.addEventListener("blur", () => {
          const currentName = nameInput.dataset.deck;
          const requestedName = nameInput.value.trim();
          if (!requestedName) {
            nameInput.value = formatCategoryName(currentName);
            return;
          }

          if (renameCategoryInMemory(currentName, requestedName)) {
            const nextName = requestedName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
            nameInput.dataset.deck = nextName;
            const section = nameInput.closest(".deck");
            if (section) {
              section.dataset.deck = nextName;
              section.querySelectorAll("[data-deck]").forEach((element) => {
                element.dataset.deck = nextName;
              });
            }
          } else {
            nameInput.value = formatCategoryName(currentName);
          }
        });
        header.replaceChildren(nameInput);
      } else {
        header.textContent = `${title} (${matchingItems.length})`;
      }
    }

    if (collapsedNote) {
      collapsedNote.textContent = collapsedDecks[deckName] && editMode
        ? "Drag to reorder"
        : "";
    }

    list.innerHTML = "";

    matchingItems.forEach(({ item, index }) => {
      const row = document.createElement("li");
      row.dataset.deck = deckName;
      row.dataset.index = index;
      row.draggable = editMode;
      row.addEventListener("dragstart", handleDragStart);
      row.addEventListener("dragover", handleDragOver);
      row.addEventListener("dragleave", handleDragLeave);
      row.addEventListener("drop", handleDrop);
      row.addEventListener("dragend", handleDragEnd);

      const content = document.createElement("div");
      content.className = "content";

      const isFavorite = isItemFavorite(item);
      row.classList.toggle("favorite", isFavorite);

      if (isImageEntry(item)) {
        const imageGroup = document.createElement("div");
        imageGroup.className = "image-entry";

        const image = document.createElement("img");
        image.alt = "clothing item";
        hydrateStoredImage(image, item);
        if (editMode) {
          image.classList.add("editable-item-image");
          image.title = "Choose a replacement image";
          image.addEventListener("click", () => {
            savePendingImageTarget({ deck: deckName, index, slot: "primary" });
            showImagesPage();
          });
        } else {
          addImageInteractions(image, item, item.secondImage);
        }
        imageGroup.appendChild(image);

        if (editMode && item.secondImage) {
          const secondImage = document.createElement("img");
          secondImage.className = "secondary-item-image editable-item-image";
          secondImage.alt = "second clothing item photo";
          hydrateStoredImage(secondImage, item.secondImage);
          secondImage.title = "Choose a replacement image";
          secondImage.addEventListener("click", () => {
            savePendingImageTarget({ deck: deckName, index, slot: "secondary" });
            showImagesPage();
          });
          imageGroup.appendChild(secondImage);
        }

        if (editMode) {
          const nameInput = document.createElement("input");
          nameInput.className = "name-edit-input";
          nameInput.type = "text";
          nameInput.value = item.name || "";
          nameInput.dataset.deck = deckName;
          nameInput.dataset.index = index;
          nameInput.placeholder = "Name";
          imageGroup.appendChild(nameInput);
        } else if (item.name) {
          const label = document.createElement("span");
          label.className = "item-name-link";
          label.textContent = item.name;
          label.addEventListener("click", () => openItemDetails(deckName, index));
          imageGroup.appendChild(label);
        }

        content.appendChild(imageGroup);
      } else if (isImageUrl(item) || isDataUrl(item)) {
        const image = document.createElement("img");
        image.src = item;
        image.alt = "clothing item";
        if (editMode) {
          image.classList.add("editable-item-image");
          image.title = "Choose a replacement image";
          image.addEventListener("click", () => {
            savePendingImageTarget({ deck: deckName, index, slot: "primary" });
            showImagesPage();
          });
        } else {
          addImageInteractions(image, item);
        }
        content.appendChild(image);

        if (editMode) {
          const nameInput = document.createElement("input");
          nameInput.className = "name-edit-input";
          nameInput.type = "text";
          nameInput.value = "";
          nameInput.dataset.deck = deckName;
          nameInput.dataset.index = index;
          nameInput.placeholder = "Name";
          content.appendChild(nameInput);
        }
      } else if (isTextObject(item)) {
        if (editMode) {
          const nameInput = document.createElement("input");
          nameInput.className = "name-edit-input";
          nameInput.type = "text";
          nameInput.value = item.text;
          nameInput.dataset.deck = deckName;
          nameInput.dataset.index = index;
          nameInput.placeholder = "Name";
          content.appendChild(nameInput);
        } else {
          const label = document.createElement("span");
          label.className = "item-name-link";
          label.textContent = item.text;
          label.addEventListener("click", () => openItemDetails(deckName, index));
          content.appendChild(label);
        }
      } else {
        if (editMode) {
          const nameInput = document.createElement("input");
          nameInput.className = "name-edit-input";
          nameInput.type = "text";
          nameInput.value = item;
          nameInput.dataset.deck = deckName;
          nameInput.dataset.index = index;
          nameInput.placeholder = "Name";
          content.appendChild(nameInput);
        } else {
          const label = document.createElement("span");
          label.className = "item-name-link";
          label.textContent = item;
          label.addEventListener("click", () => openItemDetails(deckName, index));
          content.appendChild(label);
        }
      }

      row.appendChild(content);

      if (!editMode) {
        const favoriteButton = document.createElement("button");
        favoriteButton.type = "button";
        favoriteButton.className = `favorite-toggle${isFavorite ? " filled" : ""}`;
        favoriteButton.dataset.deck = deckName;
        favoriteButton.dataset.index = index;
        favoriteButton.setAttribute("aria-label", isFavorite ? "Unfavorite item" : "Favorite item");
        favoriteButton.textContent = isFavorite ? "❤" : "♡";
        row.appendChild(favoriteButton);
      }

      if (editMode) {
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.dataset.deck = deckName;
        removeButton.dataset.index = index;
        removeButton.textContent = "x";
        row.appendChild(removeButton);

        if (isImageEntry(item) && item.secondImage) {
          const swapPhotoButton = document.createElement("button");
          swapPhotoButton.type = "button";
          swapPhotoButton.className = "swap-photo-button";
          swapPhotoButton.textContent = "↔";
          swapPhotoButton.dataset.deck = deckName;
          swapPhotoButton.dataset.index = index;
          swapPhotoButton.setAttribute("aria-label", "Switch main and second photo");
          row.appendChild(swapPhotoButton);
        } else {
          const addPhotoButton = document.createElement("button");
          addPhotoButton.type = "button";
          addPhotoButton.className = "add-photo-button";
          addPhotoButton.textContent = "+";
          addPhotoButton.dataset.deck = deckName;
          addPhotoButton.dataset.index = index;
          addPhotoButton.setAttribute("aria-label", "Add another photo");
          row.appendChild(addPhotoButton);
        }
      }

      list.appendChild(row);
    });

    deckGrid.appendChild(section);
  });

  if (searchEmptyMessage) {
    searchEmptyMessage.classList.toggle("hidden", !searchQuery || visibleItemCount > 0);
  }
}

function bindMainPageEvents() {
  const menuButton = document.getElementById("menu-button");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");
  const sidebarClose = document.getElementById("sidebar-close");
  const menuFavorites = document.getElementById("menu-favorites");
  const menuGallery = document.getElementById("menu-gallery");
  const menuOutfit = document.getElementById("menu-outfit");
  const editBtn = document.getElementById("edit-button");
  const addCategoryBtn = document.getElementById("add-category-button");
  const tagsButton = document.getElementById("tags-button");
  const confirmDeleteButton = document.getElementById("confirm-delete-button");
  const cancelDeleteButton = document.getElementById("cancel-delete-button");
  const deleteConfirmationElement = document.getElementById("delete-confirmation");
  const addCategoryModal = document.getElementById("add-category-modal");
  const closetSearch = document.getElementById("closet-search");
  const closetSearchTypeInput = document.getElementById("closet-search-type");
  const categoryNameInput = document.getElementById("category-name-input");
  const saveCategoryButton = document.getElementById("save-category-button");
  const cancelCategoryButton = document.getElementById("cancel-category-button");

  if (menuButton) {
    menuButton.addEventListener("click", openSidebar);
  }

  if (sidebarClose) {
    sidebarClose.addEventListener("click", closeSidebar);
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener("click", closeSidebar);
  }

  if (menuFavorites) {
    menuFavorites.addEventListener("click", () => {
      clearClosetSearch();
      closeSidebar();
      showFavoritesPage();
    });
  }

  if (menuGallery) {
    menuGallery.addEventListener("click", () => {
      clearClosetSearch();
      closeSidebar();
      showImagesPage();
    });
  }

  if (menuOutfit) {
    menuOutfit.addEventListener("click", () => {
      clearClosetSearch();
      closeSidebar();
      showOutfitMaker();
    });
  }

  if (editBtn) {
    editBtn.addEventListener("click", () => {
      if (editMode) {
        saveEditedNames();
      }
      setEditMode(!editMode);
    });
  }

  if (addCategoryBtn) {
    addCategoryBtn.addEventListener("click", handleAddCategory);
  }

  if (tagsButton) {
    tagsButton.addEventListener("click", openTagManager);
  }

  if (saveCategoryButton) {
    saveCategoryButton.addEventListener("click", saveNewCategory);
  }

  if (cancelCategoryButton) {
    cancelCategoryButton.addEventListener("click", closeAddCategoryModal);
  }

  if (categoryNameInput) {
    categoryNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        saveNewCategory();
      } else if (event.key === "Escape") {
        closeAddCategoryModal();
      }
    });
  }

  if (addCategoryModal) {
    addCategoryModal.addEventListener("click", (event) => {
      if (event.target === addCategoryModal) {
        closeAddCategoryModal();
      }
    });
  }

  if (closetSearch) {
    closetSearch.addEventListener("input", () => {
      closetSearchQuery = closetSearch.value;
      renderDecks();
      document.getElementById("closet-search")?.focus();
    });
  }

  if (closetSearchTypeInput) {
    closetSearchTypeInput.addEventListener("change", () => {
      closetSearchType = closetSearchTypeInput.value;
      renderDecks();
    });
  }

  if (confirmDeleteButton) {
    confirmDeleteButton.addEventListener("click", () => {
      confirmDeleteDeck();
    });
  }

  if (cancelDeleteButton) {
    cancelDeleteButton.addEventListener("click", () => {
      closeDeleteConfirmation();
    });
  }

  if (deleteConfirmationElement) {
    deleteConfirmationElement.addEventListener("click", (event) => {
      if (event.target === deleteConfirmationElement) {
        closeDeleteConfirmation();
      }
    });
  }
}

function handleAddCategory() {
  const modal = document.getElementById("add-category-modal");
  const input = document.getElementById("category-name-input");
  if (!modal || !input) {
    return;
  }

  input.value = "";
  modal.classList.remove("hidden");
  input.focus();
}

function closeAddCategoryModal() {
  const modal = document.getElementById("add-category-modal");
  if (modal) {
    modal.classList.add("hidden");
  }
}

function openTagManager() {
  const existingModal = document.getElementById("tag-manager-modal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.id = "tag-manager-modal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content tag-manager-content">
      <h2>Your tags</h2>
      <div class="tag-manager-list"></div>
      <button type="button" class="tag-create-button" aria-label="Create a new tag">+</button>
      <div class="tag-create-form hidden">
        <input type="text" maxlength="40" placeholder="Tag name" />
        <button type="button" class="tag-save-button">Add tag</button>
      </div>
      <div class="modal-actions"><button type="button" class="tag-manager-close">Done</button></div>
    </div>
  `;
  document.body.appendChild(modal);

  const list = modal.querySelector(".tag-manager-list");
  const createButton = modal.querySelector(".tag-create-button");
  const createForm = modal.querySelector(".tag-create-form");
  const nameInput = createForm.querySelector("input");
  const renderTags = () => {
    list.replaceChildren();
    if (!closetTags.length) {
      const note = document.createElement("p");
      note.className = "empty-message";
      note.textContent = "Create a tag to get started.";
      list.appendChild(note);
      return;
    }
    closetTags.forEach((tag) => {
      const tagRow = document.createElement("span");
      tagRow.className = "tag-manager-item";
      const pill = document.createElement("span");
      pill.className = "item-tag";
      pill.textContent = tag;
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-tag-button";
      deleteButton.textContent = "×";
      deleteButton.setAttribute("aria-label", `Delete ${tag} tag`);
      deleteButton.addEventListener("click", () => {
        closetTags = closetTags.filter((existingTag) => existingTag !== tag);
        Object.keys(decks).forEach((deckName) => {
          decks[deckName] = decks[deckName].map((item) => {
            if (!item || typeof item !== "object") return item;
            const tags = (item.tags || []).filter((itemTag) => itemTag !== tag);
            return { ...item, tags };
          });
        });
        saveTags();
        saveDecks();
        renderTags();
      });
      tagRow.append(pill, deleteButton);
      list.appendChild(tagRow);
    });
  };
  renderTags();
  createButton.addEventListener("click", () => {
    createForm.classList.remove("hidden");
    nameInput.focus();
  });
  modal.querySelector(".tag-save-button").addEventListener("click", () => {
    const tagName = nameInput.value.trim();
    if (!tagName || closetTags.some((tag) => tag.toLowerCase() === tagName.toLowerCase())) return;
    closetTags.push(tagName);
    saveTags();
    nameInput.value = "";
    createForm.classList.add("hidden");
    renderTags();
  });
  const close = () => modal.remove();
  modal.querySelector(".tag-manager-close").addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
}

function saveNewCategory() {
  const input = document.getElementById("category-name-input");
  const name = input ? input.value.trim() : "";
  if (!name) {
    input?.focus();
    return;
  }

  const normalizedKey = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  let deckKey = normalizedKey || "new-category";
  let suffix = 1;
  while (decks[deckKey] || deckNames.includes(deckKey)) {
    deckKey = `${normalizedKey || "new-category"}-${suffix}`;
    suffix += 1;
  }

  decks[deckKey] = [];
  collapsedDecks[deckKey] = false;
  deckNames.push(deckKey);
  saveDecks();
  closeAddCategoryModal();
  renderDecks();
}

function showMainPage() {
  document.body.innerHTML = `
    <div class="top-buttons">
      <button type="button" id="menu-button" class="page-switch menu-button" aria-label="Open menu">☰</button>
      <button type="button" id="edit-button" class="page-switch edit-button">Edit</button>
      <button type="button" id="tags-button" class="page-switch tags-button">Tags</button>
      <button type="button" id="add-category-button" class="page-switch add-category-button hidden" aria-label="Add category">+</button>
    </div>
    <div id="sidebar-backdrop" class="sidebar-backdrop hidden"></div>
    <aside id="sidebar" class="sidebar hidden" aria-hidden="true">
      <button type="button" id="sidebar-close" class="sidebar-close" aria-label="Close menu">×</button>
      <nav class="sidebar-nav" aria-label="Page options">
        <button type="button" id="menu-favorites" class="sidebar-item">My Favorites</button>
        <button type="button" id="menu-gallery" class="sidebar-item">The Image Gallery</button>
        <button type="button" id="menu-outfit" class="sidebar-item">Outfit Maker</button>
      </nav>
    </aside>
    <div id="edit-status" class="edit-status" aria-live="polite">
      <span>Editing mode</span>
      <span id="edit-dots" class="edit-dots">.</span>
    </div>
    <main class="app-shell">
      <h1 class="page-title"><span class="title-text">The Closet</span></h1>
      <div class="search-box">
        <label class="sr-only" for="closet-search">Search closet items</label>
        <input id="closet-search" type="search" placeholder="Search your closet" autocomplete="off" />
        <label class="search-type-label" for="closet-search-type">Match</label>
        <select id="closet-search-type" aria-label="Search type">
          <option value="contains">Contains</option>
          <option value="starts-with">Starts with</option>
        </select>
      </div>
      <p id="closet-search-empty" class="search-empty hidden">No items match that search.</p>
      <div class="deck-grid"></div>
    </main>
    <div id="image-viewer" class="image-viewer" aria-hidden="true">
      <button type="button" class="image-viewer-close" aria-label="Close full-size image">×</button>
      <img id="viewer-image" src="" alt="Full-size clothing item" />
    </div>
    <div id="delete-confirmation" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="delete-confirmation-title">
      <div class="modal-content">
        <h2 id="delete-confirmation-title">Are you sure?</h2>
        <p>This will delete the category and all items inside it.</p>
        <div class="modal-actions">
          <button type="button" id="confirm-delete-button" class="danger">Yes I’m sure</button>
          <button type="button" id="cancel-delete-button">Nevermind</button>
        </div>
      </div>
    </div>
    <div id="add-category-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="add-category-title">
      <div class="modal-content">
        <h2 id="add-category-title">New category</h2>
        <label for="category-name-input">Category name</label>
        <input id="category-name-input" class="category-name-input" type="text" maxlength="40" placeholder="For example: Dresses" />
        <div class="modal-actions">
          <button type="button" id="cancel-category-button">Cancel</button>
          <button type="button" id="save-category-button">Add category</button>
        </div>
      </div>
    </div>
  `;

  bindMainPageEvents();
  setEditMode(editMode);
  applyPendingSelection();
}

document.body.addEventListener("submit", (event) => {
  const form = event.target.closest(".item-form");
  if (!form) {
    return;
  }

  event.preventDefault();
  const deckName = form.dataset.deck;
  const textInput = form.querySelector("input[type='text']");
  const value = textInput ? textInput.value.trim() : "";

  if (!value || /^https?:\/\//i.test(value)) {
    return;
  }

  decks[deckName].push(value);
  saveDecks();
  renderDecks();
  form.reset();
});

document.addEventListener("click", (event) => {
  const collapseToggle = event.target.closest(".collapse-toggle");
  if (collapseToggle) {
    const deckName = collapseToggle.dataset.deck;
    collapsedDecks[deckName] = !collapsedDecks[deckName];
    saveDecks();
    renderDecks();
    return;
  }

  const deleteDeckButton = event.target.closest(".delete-deck-button");
  if (deleteDeckButton && editMode) {
    openDeleteConfirmation(deleteDeckButton.dataset.deck);
    return;
  }

  const favoriteToggle = event.target.closest(".favorite-toggle");
  if (favoriteToggle) {
    if (editMode) {
      return;
    }
    const deckName = favoriteToggle.dataset.deck;
    const index = Number(favoriteToggle.dataset.index);
    if (decks[deckName] && Number.isInteger(index)) {
      decks[deckName][index] = setItemFavorite(decks[deckName][index], !isItemFavorite(decks[deckName][index]));
      saveDecks();
      if (document.querySelector(".favorites-page")) {
        showFavoritesPage();
      } else {
        renderDecks();
      }
    }
    return;
  }

  const button = event.target.closest("button[data-deck]");
  if (button) {
    const deckName = button.dataset.deck;
    const index = Number(button.dataset.index);

    if (button.classList.contains("add-photo-button")) {
      savePendingImageTarget({ deck: deckName, index });
      showImagesPage();
      return;
    }

    if (button.classList.contains("swap-photo-button")) {
      const item = decks[deckName]?.[index];
      if (!isImageEntry(item) || !item.secondImage) {
        return;
      }

      const previousPrimary = typeof item.src === "string"
        ? { src: item.src }
        : { imageId: item.imageId };
      const nextPrimary = typeof item.secondImage.src === "string"
        ? { src: item.secondImage.src }
        : { imageId: item.secondImage.imageId };
      decks[deckName][index] = { ...item, ...nextPrimary, secondImage: previousPrimary };
      saveDecks();
      renderDecks();
      return;
    }

    if (button.classList.contains("favorite-toggle")) {
      return;
    }

    if (button.classList.contains("favorite-item-details")) {
      return;
    }

    if (Number.isInteger(index) && decks[deckName]) {
      decks[deckName].splice(index, 1);
      saveDecks();
      renderDecks();
    }
    return;
  }

  const activeImageViewer = document.getElementById("image-viewer");
  const activeViewerImage = document.getElementById("viewer-image");
  if (event.target === activeViewerImage && viewerAlternateImageSrc) {
    const currentSource = activeViewerImage.src;
    activeViewerImage.src = viewerAlternateImageSrc;
    viewerAlternateImageSrc = currentSource;
    return;
  }
  if (event.target === activeImageViewer || event.target.closest(".image-viewer-close")) {
    closeViewer();
  }
});

function openViewer(src, alternateSrc = "") {
  const imageViewerElement = document.getElementById("image-viewer");
  const viewerImageElement = document.getElementById("viewer-image");
  if (!imageViewerElement || !viewerImageElement) {
    return;
  }
  viewerImageElement.src = src;
  viewerAlternateImageSrc = alternateSrc;
  imageViewerElement.classList.add("active");
  imageViewerElement.setAttribute("aria-hidden", "false");
}

function closeViewer() {
  const imageViewerElement = document.getElementById("image-viewer");
  const viewerImageElement = document.getElementById("viewer-image");
  if (!imageViewerElement || !viewerImageElement) {
    return;
  }
  imageViewerElement.classList.remove("active");
  imageViewerElement.setAttribute("aria-hidden", "true");
  viewerImageElement.src = "";
  viewerAlternateImageSrc = "";
}

async function openItemDetails(deckName, index, context = {}) {
  const item = decks[deckName]?.[index];
  if (item === undefined) return;

  const existingModal = document.getElementById("item-details-modal");
  if (existingModal) existingModal.remove();

  const primarySource = await getImageSource(item);
  const alternateSource = isImageEntry(item) && item.secondImage
    ? await getImageSource(item.secondImage)
    : "";
  let showingAlternate = false;

  const modal = document.createElement("div");
  modal.id = "item-details-modal";
  modal.className = "item-details-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <div class="item-details-content">
      <button type="button" class="details-nav-btn details-prev-btn" aria-label="Previous item">‹</button>
      <button type="button" class="details-close-btn" aria-label="Close item details">×</button>
      <button type="button" class="details-edit-btn" aria-label="Edit item details">Edit</button>
      <button type="button" class="details-nav-btn details-next-btn" aria-label="Next item">›</button>
      <div class="details-display">
        <img class="details-image${alternateSource ? " flippable" : ""}" alt="clothing item" />
        <div class="details-name-row"><h2 class="details-name"></h2><span class="details-favorite-heart hidden" aria-label="Favorite item">♥</span></div>
        <div class="details-tags"></div>
        <p class="details-description"></p>
      </div>
      <form class="details-edit-form hidden">
        <label for="details-name-input">Item name</label>
        <input id="details-name-input" type="text" maxlength="80" />
        <label for="details-description-input">Description</label>
        <textarea id="details-description-input" rows="4" maxlength="400" placeholder="Add notes about this item"></textarea>
        <div class="modal-actions">
          <button type="button" class="details-cancel-edit">Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  const image = modal.querySelector(".details-image");
  const name = modal.querySelector(".details-name");
  const favoriteHeart = modal.querySelector(".details-favorite-heart");
  const description = modal.querySelector(".details-description");
  const tagsContainer = modal.querySelector(".details-tags");
  const display = modal.querySelector(".details-display");
  const form = modal.querySelector(".details-edit-form");
  const nameInput = modal.querySelector("#details-name-input");
  const descriptionInput = modal.querySelector("#details-description-input");
  const close = () => modal.remove();
  const navigateDetails = (direction) => {
    const categoryItems = decks[deckName] || [];
    const eligibleItems = context.outfitBoardIndex === undefined
      ? categoryItems.map((item, itemIndex) => ({ item, itemIndex }))
      : categoryItems.map((item, itemIndex) => ({ item, itemIndex })).filter(({ item }) => isImageEntry(item) || isImageUrl(item) || isDataUrl(item));
    const filteredItems = context.favoriteOnly
      ? eligibleItems.filter(({ item }) => isItemFavorite(item))
      : eligibleItems;
    if (filteredItems.length < 2) return;
    const currentPosition = filteredItems.findIndex(({ itemIndex }) => itemIndex === index);
    const nextPosition = (currentPosition + direction + filteredItems.length) % filteredItems.length;
    const nextItemIndex = filteredItems[nextPosition].itemIndex;

    if (context.outfitBoardIndex !== undefined) {
      const currentBoardItem = outfitBoardItems[context.outfitBoardIndex];
      const nextItem = decks[deckName][nextItemIndex];
      outfitBoardItems[context.outfitBoardIndex] = {
        ...getOutfitSource(nextItem),
        name: getItemLabel(nextItem),
        deckName,
        itemIndex: nextItemIndex,
        x: currentBoardItem?.x ?? 40,
        y: currentBoardItem?.y ?? 12
      };
      saveOutfitBoard();
      context.renderBoard?.();
    }

    openItemDetails(deckName, nextItemIndex, context);
  };
  const refreshDetails = () => {
    const currentItem = decks[deckName]?.[index];
    name.textContent = getItemLabel(currentItem) || "Unnamed item";
    favoriteHeart.classList.toggle("hidden", !isItemFavorite(currentItem));
    description.textContent = currentItem?.description || "";
    description.classList.toggle("hidden", !currentItem?.description);
    tagsContainer.replaceChildren();
    (currentItem?.tags || []).forEach((tag) => {
      const tagRow = document.createElement("span");
      tagRow.className = "item-tag removable-item-tag";
      const tagLabel = document.createElement("span");
      tagLabel.textContent = tag;
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "remove-item-tag-button";
      removeButton.textContent = "×";
      removeButton.setAttribute("aria-label", `Remove ${tag} tag from item`);
      removeButton.addEventListener("click", () => {
        const latestItem = decks[deckName]?.[index];
        if (!latestItem || typeof latestItem !== "object") return;
        decks[deckName][index] = { ...latestItem, tags: (latestItem.tags || []).filter((itemTag) => itemTag !== tag) };
        saveDecks();
        refreshDetails();
        renderDecks();
      });
      tagRow.append(tagLabel, removeButton);
      tagsContainer.appendChild(tagRow);
    });
    const addTagButton = document.createElement("button");
    addTagButton.type = "button";
    addTagButton.className = "add-item-tag-button";
    addTagButton.textContent = "+";
    addTagButton.setAttribute("aria-label", "Add a tag to this item");
    tagsContainer.appendChild(addTagButton);
    addTagButton.addEventListener("click", () => {
      const picker = document.createElement("div");
      picker.className = "item-tag-picker";
      const availableTags = closetTags.filter((tag) => !(currentItem?.tags || []).includes(tag));
      if (!availableTags.length) {
        picker.textContent = closetTags.length ? "All tags are already added." : "Create tags from the Tags button first.";
      } else {
        availableTags.forEach((tag) => {
          const option = document.createElement("button");
          option.type = "button";
          option.textContent = tag;
          option.addEventListener("click", () => {
            const latestItem = decks[deckName]?.[index];
            if (!latestItem) return;
            const tags = Array.from(new Set([...(latestItem.tags || []), tag]));
            decks[deckName][index] = typeof latestItem === "string"
              ? { text: latestItem, tags }
              : { ...latestItem, tags };
            saveDecks();
            refreshDetails();
            renderDecks();
          });
          picker.appendChild(option);
        });
      }
      tagsContainer.appendChild(picker);
      addTagButton.remove();
    });
  };

  if (primarySource) {
    image.src = primarySource;
  } else {
    image.classList.add("hidden");
  }
  refreshDetails();

  image.addEventListener("click", () => {
    if (!alternateSource) return;
    showingAlternate = !showingAlternate;
    image.src = showingAlternate ? alternateSource : primarySource;
  });

  modal.querySelector(".details-close-btn").addEventListener("click", close);
  modal.querySelector(".details-prev-btn").addEventListener("click", () => navigateDetails(-1));
  modal.querySelector(".details-next-btn").addEventListener("click", () => navigateDetails(1));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  modal.querySelector(".details-edit-btn").addEventListener("click", () => {
    const currentItem = decks[deckName]?.[index];
    nameInput.value = getItemLabel(currentItem);
    descriptionInput.value = currentItem?.description || "";
    display.classList.add("hidden");
    form.classList.remove("hidden");
    nameInput.focus();
  });
  modal.querySelector(".details-cancel-edit").addEventListener("click", () => {
    form.classList.add("hidden");
    display.classList.remove("hidden");
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const currentItem = decks[deckName]?.[index];
    const nextName = nameInput.value.trim();
    const nextDescription = descriptionInput.value.trim();
    if (isImageEntry(currentItem)) {
      decks[deckName][index] = { ...currentItem, name: nextName, description: nextDescription };
    } else if (isTextObject(currentItem)) {
      decks[deckName][index] = { ...currentItem, text: nextName, description: nextDescription };
    } else {
      decks[deckName][index] = { text: nextName, description: nextDescription, favorite: isItemFavorite(currentItem) };
    }
    saveDecks();
    form.classList.add("hidden");
    display.classList.remove("hidden");
    refreshDetails();
    renderDecks();
  });
}

function openFavoriteOutfitDetails(outfitIndex) {
  const outfit = favoriteOutfits[outfitIndex];
  if (!outfit) return;
  const modal = document.createElement("div");
  modal.className = "item-details-modal";
  modal.innerHTML = `
    <div class="item-details-content favorite-outfit-details">
      <button type="button" class="details-close-btn" aria-label="Close outfit details">×</button>
      <button type="button" class="details-edit-btn" aria-label="Edit outfit name">Edit</button>
      <div class="favorite-outfit-display"><h2 class="favorite-outfit-details-name"></h2><div class="favorite-outfit-detail-items"></div></div>
      <form class="favorite-outfit-edit-form hidden"><label for="favorite-outfit-name-input">Outfit name</label><input id="favorite-outfit-name-input" type="text" maxlength="80" placeholder="Outfit name" /><div class="modal-actions"><button type="button" class="favorite-outfit-cancel">Cancel</button><button type="submit">Save</button></div></form>
    </div>`;
  document.body.appendChild(modal);
  const itemList = modal.querySelector(".favorite-outfit-detail-items");
  const nameHeading = modal.querySelector(".favorite-outfit-details-name");
  const display = modal.querySelector(".favorite-outfit-display");
  const editForm = modal.querySelector(".favorite-outfit-edit-form");
  const nameInput = modal.querySelector("#favorite-outfit-name-input");
  const getOutfitName = () => favoriteOutfits[outfitIndex].name || `Outfit ${outfitIndex + 1}`;
  nameHeading.textContent = getOutfitName();
  outfit.items.forEach((item) => {
    const itemRow = document.createElement("div");
    itemRow.className = "favorite-outfit-detail-item";
    const image = document.createElement("img");
    image.alt = item.name || "outfit item";
    hydrateStoredImage(image, getOutfitSource(item));
    const label = document.createElement("span");
    label.textContent = item.name || "Unnamed item";
    itemRow.append(image, label);
    itemList.appendChild(itemRow);
  });
  const close = () => modal.remove();
  modal.querySelector(".details-close-btn").addEventListener("click", close);
  modal.querySelector(".details-edit-btn").addEventListener("click", () => {
    nameInput.value = favoriteOutfits[outfitIndex].name || "";
    display.classList.add("hidden");
    editForm.classList.remove("hidden");
    nameInput.focus();
  });
  modal.querySelector(".favorite-outfit-cancel").addEventListener("click", () => {
    editForm.classList.add("hidden");
    display.classList.remove("hidden");
  });
  editForm.addEventListener("submit", (event) => {
    event.preventDefault();
    favoriteOutfits[outfitIndex].name = nameInput.value.trim();
    saveFavoriteOutfits();
    nameHeading.textContent = getOutfitName();
    const cardName = document.querySelector(`.favorite-outfit-card[data-outfit-index="${outfitIndex}"] .favorite-outfit-name`);
    if (cardName) cardName.textContent = getOutfitName();
    editForm.classList.add("hidden");
    display.classList.remove("hidden");
  });
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeViewer();
  }
});

function getOutfitSource(item) {
  if (typeof item === "string") {
    return { src: item };
  }
  return item.imageId ? { imageId: item.imageId } : { src: item.src };
}

function findOutfitItemReference(boardItem) {
  if (boardItem.deckName !== undefined && Number.isInteger(boardItem.itemIndex) && decks[boardItem.deckName]?.[boardItem.itemIndex]) {
    return { deckName: boardItem.deckName, itemIndex: boardItem.itemIndex };
  }

  for (const deckName of deckNames) {
    const itemIndex = decks[deckName].findIndex((item) => {
      if (typeof item === "string") return item === boardItem.src;
      if (!item || typeof item !== "object") return false;
      return (boardItem.imageId && item.imageId === boardItem.imageId) || (boardItem.src && item.src === boardItem.src);
    });
    if (itemIndex >= 0) return { deckName, itemIndex };
  }
  return null;
}

function showOutfitMaker() {
  document.body.innerHTML = `
    <div class="top-buttons">
      <button type="button" id="menu-button" class="page-switch menu-button" aria-label="Open menu">☰</button>
      <button type="button" id="page-back-button" class="page-switch" aria-label="Back">←</button>
    </div>
    <div id="sidebar-backdrop" class="sidebar-backdrop hidden"></div>
    <aside id="sidebar" class="sidebar hidden" aria-hidden="true">
      <button type="button" id="sidebar-close" class="sidebar-close" aria-label="Close menu">×</button>
      <nav class="sidebar-nav" aria-label="Page options">
        <button type="button" id="menu-closet" class="sidebar-item">The Closet</button>
        <button type="button" id="menu-favorites" class="sidebar-item">Favorites</button>
        <button type="button" id="menu-gallery" class="sidebar-item">The Image Gallery</button>
      </nav>
    </aside>
    <main class="outfit-maker-page">
      <div class="outfit-title-row"><h2>Outfit Maker</h2><button type="button" id="favorite-outfit-button">Favorite outfit</button><button type="button" id="add-outfit-button" aria-label="Add clothing item">+</button></div>
      <div id="outfit-display" class="outfit-display">
        <p class="outfit-empty-message">Add up to 10 clothing items to build an outfit.</p>
      </div>
    </main>
  `;

  const display = document.getElementById("outfit-display");
  let activeOutfitDrag = null;
  let lastOutfitTap = { card: null, time: 0 };
  display.addEventListener("pointermove", (event) => {
    if (!activeOutfitDrag || event.buttons !== 0) return;
    const card = activeOutfitDrag.card;
    const bounds = display.getBoundingClientRect();
    const left = Math.max(0, Math.min(display.clientWidth - card.offsetWidth, event.clientX - bounds.left - card.offsetWidth / 2));
    const top = Math.max(0, Math.min(display.clientHeight - card.offsetHeight, event.clientY - bounds.top - card.offsetHeight / 2));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    outfitBoardItems[activeOutfitDrag.index].x = left / display.clientWidth * 100;
    outfitBoardItems[activeOutfitDrag.index].y = top / display.clientHeight * 100;
    saveOutfitBoard();
  });
  const renderBoard = () => {
    display.querySelectorAll(".outfit-item").forEach((element) => element.remove());
    display.querySelector(".outfit-empty-message")?.classList.toggle("hidden", outfitBoardItems.length > 0);
    outfitBoardItems.forEach((boardItem, index) => {
      const itemReference = findOutfitItemReference(boardItem);
      if (itemReference && (boardItem.deckName !== itemReference.deckName || boardItem.itemIndex !== itemReference.itemIndex)) {
        boardItem.deckName = itemReference.deckName;
        boardItem.itemIndex = itemReference.itemIndex;
        saveOutfitBoard();
      }
      const card = document.createElement("div");
      card.className = "outfit-item";
      card.style.left = `${boardItem.x ?? 40 + (index % 4) * 22}%`;
      card.style.top = `${boardItem.y ?? 12 + Math.floor(index / 4) * 30}%`;
      card.dataset.index = index;
      const image = document.createElement("img");
      image.alt = boardItem.name || "clothing item";
      hydrateStoredImage(image, getOutfitSource(boardItem));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-outfit-item";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Remove item from outfit");
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        outfitBoardItems.splice(index, 1);
        saveOutfitBoard();
        renderBoard();
      });
      card.append(image, remove);
      let dragStart = null;
      let wasAlreadyMoving = false;
      let movedDuringTap = false;
      card.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button")) return;
        if (event.button === 0) {
          const reference = findOutfitItemReference(boardItem);
          if (reference) {
            openItemDetails(reference.deckName, reference.itemIndex, { outfitBoardIndex: index, renderBoard });
          }
          return;
        }
        if (event.button !== 2) return;
        if (activeOutfitDrag && activeOutfitDrag.card !== card) return;
        wasAlreadyMoving = Boolean(activeOutfitDrag);
        movedDuringTap = false;
        if (!activeOutfitDrag) {
          activeOutfitDrag = { card, index };
          card.classList.add("outfit-item-moving");
        }
        dragStart = { x: event.clientX, y: event.clientY, left: card.offsetLeft, top: card.offsetTop };
        card.setPointerCapture(event.pointerId);
      });
      card.addEventListener("pointermove", (event) => {
        if (!dragStart || !activeOutfitDrag || activeOutfitDrag.card !== card) return;
        movedDuringTap = true;
        const maxLeft = Math.max(0, display.clientWidth - card.offsetWidth);
        const maxTop = Math.max(0, display.clientHeight - card.offsetHeight);
        const left = Math.max(0, Math.min(maxLeft, dragStart.left + event.clientX - dragStart.x));
        const top = Math.max(0, Math.min(maxTop, dragStart.top + event.clientY - dragStart.y));
        card.style.left = `${left}px`;
        card.style.top = `${top}px`;
      });
      card.addEventListener("pointerup", () => {
        if (!dragStart) return;
        if (movedDuringTap) {
          outfitBoardItems[index].x = Number.parseFloat(card.style.left) / display.clientWidth * 100;
          outfitBoardItems[index].y = Number.parseFloat(card.style.top) / display.clientHeight * 100;
          saveOutfitBoard();
        } else if (wasAlreadyMoving && lastOutfitTap.card === card && Date.now() - lastOutfitTap.time < 400) {
          activeOutfitDrag = null;
          card.classList.remove("outfit-item-moving");
          lastOutfitTap = { card: null, time: 0 };
          if (boardItem.deckName !== undefined && Number.isInteger(boardItem.itemIndex)) {
            openItemDetails(boardItem.deckName, boardItem.itemIndex);
          }
        } else if (wasAlreadyMoving) {
          activeOutfitDrag = null;
          card.classList.remove("outfit-item-moving");
          lastOutfitTap = { card: null, time: 0 };
        } else {
          lastOutfitTap = { card, time: Date.now() };
        }
        dragStart = null;
      });
      card.addEventListener("contextmenu", (event) => {
        event.preventDefault();
      });
      display.appendChild(card);
    });
  };

  const openPicker = () => {
    if (outfitBoardItems.length >= 10) {
      alert("An outfit can have up to 10 items.");
      return;
    }
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `<div class="modal-content outfit-picker-content"><h2>Add an item</h2><label for="outfit-category-select">Category</label><select id="outfit-category-select"></select><div id="outfit-item-choices" class="outfit-item-choices"></div><div class="modal-actions"><button type="button" class="outfit-picker-close">Cancel</button></div></div>`;
    document.body.appendChild(modal);
    const categorySelect = modal.querySelector("#outfit-category-select");
    deckNames.forEach((deckName) => {
      const option = document.createElement("option");
      option.value = deckName;
      option.textContent = formatCategoryName(deckName);
      categorySelect.appendChild(option);
    });
    const choices = modal.querySelector("#outfit-item-choices");
    const renderChoices = () => {
      choices.replaceChildren();
      const imageItems = decks[categorySelect.value].map((item, index) => ({ item, index })).filter(({ item }) => isImageEntry(item) || isImageUrl(item) || isDataUrl(item));
      if (!imageItems.length) {
        choices.textContent = "This category has no items with images.";
        return;
      }
      imageItems.forEach(({ item, index }) => {
        const choice = document.createElement("button");
        choice.type = "button";
        choice.className = "outfit-item-choice";
        const image = document.createElement("img");
        image.alt = getItemLabel(item) || "clothing item";
        hydrateStoredImage(image, item);
        const label = document.createElement("span");
        label.textContent = getItemLabel(item) || "Unnamed item";
        choice.append(image, label);
        choice.addEventListener("click", () => {
          const source = getOutfitSource(item);
          outfitBoardItems.push({ ...source, name: getItemLabel(item), deckName: categorySelect.value, itemIndex: index, x: 40, y: 12 });
          saveOutfitBoard();
          modal.remove();
          renderBoard();
        });
        choices.appendChild(choice);
      });
    };
    categorySelect.addEventListener("change", renderChoices);
    modal.querySelector(".outfit-picker-close").addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (event) => { if (event.target === modal) modal.remove(); });
    renderChoices();
  };
  document.getElementById("add-outfit-button").addEventListener("click", openPicker);
  document.getElementById("favorite-outfit-button").addEventListener("click", () => {
    if (!outfitBoardItems.length) {
      alert("Add at least one item before favoriting an outfit.");
      return;
    }
    favoriteOutfits.push({ id: crypto.randomUUID(), items: outfitBoardItems.map((item) => ({ ...item })) });
    saveFavoriteOutfits();
    alert("Outfit saved to Your Favorite Outfits.");
  });
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  document.getElementById("menu-button").addEventListener("click", () => { sidebar.classList.remove("hidden"); backdrop.classList.remove("hidden"); });
  document.getElementById("sidebar-close").addEventListener("click", () => { sidebar.classList.add("hidden"); backdrop.classList.add("hidden"); });
  backdrop.addEventListener("click", () => { sidebar.classList.add("hidden"); backdrop.classList.add("hidden"); });
  document.getElementById("menu-closet").addEventListener("click", showMainPage);
  document.getElementById("menu-favorites").addEventListener("click", showFavoritesPage);
  document.getElementById("menu-gallery").addEventListener("click", showImagesPage);
  document.getElementById("page-back-button").addEventListener("click", showMainPage);
  renderBoard();
}

function showBlankPage(message) {
  document.body.innerHTML = `
    <div class="top-buttons">
      <button type="button" id="menu-button" class="page-switch menu-button" aria-label="Open menu">☰</button>
      <button type="button" id="page-back-button" class="page-switch" aria-label="Back">←</button>
    </div>
    <div id="sidebar-backdrop" class="sidebar-backdrop hidden"></div>
    <aside id="sidebar" class="sidebar hidden" aria-hidden="true">
      <button type="button" id="sidebar-close" class="sidebar-close" aria-label="Close menu">×</button>
      <nav class="sidebar-nav" aria-label="Page options">
        <button type="button" id="menu-closet" class="sidebar-item">The Closet</button>
        <button type="button" id="menu-favorites" class="sidebar-item">Favorites</button>
        <button type="button" id="menu-gallery" class="sidebar-item">The Image Gallery</button>
      </nav>
    </aside>
    <div class="blank-page">
      <div>
        <p>${message}</p>
      </div>
    </div>
  `;

  const menuButton = document.getElementById("menu-button");
  const pageBackButton = document.getElementById("page-back-button");
  const sidebar = document.getElementById("sidebar");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");
  const sidebarClose = document.getElementById("sidebar-close");
  const menuCloset = document.getElementById("menu-closet");
  const menuFavorites = document.getElementById("menu-favorites");
  const menuGallery = document.getElementById("menu-gallery");

  const openSidebar = () => {
    sidebar.classList.remove("hidden");
    sidebarBackdrop.classList.remove("hidden");
    sidebar.setAttribute("aria-hidden", "false");
  };

  const closeSidebar = () => {
    sidebar.classList.add("hidden");
    sidebarBackdrop.classList.add("hidden");
    sidebar.setAttribute("aria-hidden", "true");
  };

  if (menuButton) {
    menuButton.addEventListener("click", openSidebar);
  }

  if (sidebarClose) {
    sidebarClose.addEventListener("click", closeSidebar);
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener("click", closeSidebar);
  }

  if (menuCloset) {
    menuCloset.addEventListener("click", () => {
      showMainPage();
    });
  }

  if (menuFavorites) {
    menuFavorites.addEventListener("click", () => {
      closeSidebar();
      showFavoritesPage();
    });
  }

  if (menuGallery) {
    menuGallery.addEventListener("click", () => {
      closeSidebar();
      showImagesPage();
    });
  }

  if (pageBackButton) {
    pageBackButton.addEventListener("click", () => {
      showMainPage();
    });
  }
}

function showImagesPage() {
  const gallery = loadGallery();
  const pendingImageTarget = loadPendingImageTarget();
  const choosingForExistingItem = Boolean(
    pendingImageTarget &&
    decks[pendingImageTarget.deck] &&
    Number.isInteger(pendingImageTarget.index)
  );
  document.body.innerHTML = `
    <div class="top-buttons">
      <button type="button" id="menu-button" class="page-switch menu-button" aria-label="Open menu">☰</button>
      <button type="button" id="page-back-button" class="page-switch" aria-label="Back">←</button>
    </div>
    <div id="sidebar-backdrop" class="sidebar-backdrop hidden"></div>
    <aside id="sidebar" class="sidebar hidden" aria-hidden="true">
      <button type="button" id="sidebar-close" class="sidebar-close" aria-label="Close menu">×</button>
      <nav class="sidebar-nav" aria-label="Page options">
        <button type="button" id="menu-closet" class="sidebar-item">The Closet</button>
        <button type="button" id="menu-favorites" class="sidebar-item">Favorites</button>
        <button type="button" id="menu-outfit" class="sidebar-item">Outfit Maker</button>
      </nav>
    </aside>
    <div class="gallery-page">
      <h2>${choosingForExistingItem ? "Choose image" : "The Image Gallery"}</h2>
      ${choosingForExistingItem ? "" : `
        <form id="gallery-form">
          <input id="gallery-url" type="text" placeholder="Paste image URL" />
          <button type="submit">Add image</button>
        </form>
        <div style="text-align: center; margin: 1rem 0;">
          <label for="gallery-file-input" style="display: block; margin-bottom: 0.5rem;">Or upload from device:</label>
          <input type="file" id="gallery-file-input" accept="image/*" multiple style="display: block; margin: 0 auto;" />
        </div>
      `}
      <div class="gallery-list">
        ${gallery.length ? gallery.map((image, index) => {
          const src = typeof image === "string" ? image : "";
          const imageId = typeof image === "object" && image ? image.imageId : "";
          return `
          <div class="gallery-item">
            <img src="${escapeHtmlAttribute(src)}" data-image-id="${escapeHtmlAttribute(imageId)}" alt="gallery item" />
            <button class="gallery-use" data-gallery-index="${index}">${choosingForExistingItem ? "Choose" : "Use image"}</button>
          </div>
        `;
        }).join("") : "<p>No images yet.</p>"}
      </div>
    </div>
  `;

  document.querySelectorAll(".gallery-item img[data-image-id]").forEach((image) => {
    const imageId = image.dataset.imageId;
    if (imageId) hydrateStoredImage(image, { imageId });
  });

  const menuButton = document.getElementById("menu-button");
  const pageBackButton = document.getElementById("page-back-button");
  const sidebar = document.getElementById("sidebar");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");
  const sidebarClose = document.getElementById("sidebar-close");
  const menuCloset = document.getElementById("menu-closet");
  const menuFavorites = document.getElementById("menu-favorites");
  const menuOutfit = document.getElementById("menu-outfit");

  const openSidebar = () => {
    sidebar.classList.remove("hidden");
    sidebarBackdrop.classList.remove("hidden");
    sidebar.setAttribute("aria-hidden", "false");
  };

  const closeSidebar = () => {
    sidebar.classList.add("hidden");
    sidebarBackdrop.classList.add("hidden");
    sidebar.setAttribute("aria-hidden", "true");
  };

  if (menuButton) {
    menuButton.addEventListener("click", openSidebar);
  }

  if (sidebarClose) {
    sidebarClose.addEventListener("click", closeSidebar);
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener("click", closeSidebar);
  }

  if (menuCloset) {
    menuCloset.addEventListener("click", () => {
      if (choosingForExistingItem) {
        clearPendingImageTarget();
      }
      showMainPage();
    });
  }

  if (menuFavorites) {
    menuFavorites.addEventListener("click", () => {
      closeSidebar();
      showFavoritesPage();
    });
  }

  if (menuOutfit) {
    menuOutfit.addEventListener("click", () => {
      closeSidebar();
      showOutfitMaker();
    });
  }

  if (pageBackButton) {
    pageBackButton.addEventListener("click", () => {
      if (choosingForExistingItem) {
        clearPendingImageTarget();
      }
      showMainPage();
    });
  }

  const galleryForm = document.getElementById("gallery-form");
  if (galleryForm) {
    galleryForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.getElementById("gallery-url");
      const value = input.value.trim();
      if (!value) {
        return;
      }

      saveGallery([value]);
      showImagesPage();
    });
  }

  const fileInput = document.getElementById("gallery-file-input");
  if (fileInput) {
    fileInput.addEventListener("change", (event) => {
      const files = Array.from(event.target.files);
      if (files.length === 0) return;

      const dataUrls = [];
      let loaded = 0;

      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          dataUrls.push(e.target.result);
          loaded++;
          if (loaded === files.length) {
            try {
              const storedImages = await Promise.all(dataUrls.map(async (dataUrl) => ({ imageId: await storeImageData(dataUrl) })));
              if (saveGallery(storedImages)) {
                showImagesPage();
              }
            } catch (error) {
              console.error("Could not store uploaded images:", error);
              alert("The photos could not be saved. Please try again with fewer or smaller images.");
            }
          }
        };
        reader.readAsDataURL(file);
      });
    });
  }

  document.querySelectorAll(".gallery-use").forEach((button) => {
    button.addEventListener("click", () => {
      const galleryIndex = Number(button.dataset.galleryIndex);
      const galleryImage = gallery[galleryIndex];
      if (!galleryImage) return;
      const imageItem = typeof galleryImage === "string"
        ? { src: galleryImage, name: "", favorite: false }
        : { imageId: galleryImage.imageId, name: "", favorite: false };

      if (choosingForExistingItem) {
        const deck = decks[pendingImageTarget.deck];
        const index = pendingImageTarget.index;
        if (!deck || index < 0 || index >= deck.length) {
          clearPendingImageTarget();
          showMainPage();
          return;
        }

        const originalItem = deck[index];
        const replacementImage = typeof galleryImage === "string"
          ? { src: galleryImage }
          : { imageId: galleryImage.imageId };

        if (pendingImageTarget.slot === "primary" && isImageEntry(originalItem)) {
          const { src, imageId, ...itemDetails } = originalItem;
          deck[index] = { ...itemDetails, ...replacementImage };
        } else if (pendingImageTarget.slot === "primary" && (isImageUrl(originalItem) || isDataUrl(originalItem))) {
          deck[index] = { ...replacementImage, name: "", favorite: false };
        } else if (pendingImageTarget.slot === "secondary" && isImageEntry(originalItem)) {
          deck[index] = { ...originalItem, secondImage: replacementImage };
        } else if (isImageEntry(originalItem) || isImageUrl(originalItem) || isDataUrl(originalItem)) {
          const primaryImage = isImageEntry(originalItem)
            ? originalItem
            : { src: originalItem, name: "", favorite: false };
          if (primaryImage.secondImage) {
            alert("Each item can have up to two images.");
            return;
          }
          deck[index] = { ...primaryImage, secondImage: imageItem };
        } else {
          imageItem.name = getItemLabel(originalItem);
          imageItem.favorite = isItemFavorite(originalItem);
          deck[index] = imageItem;
        }
        if (!saveDecks()) {
          deck[index] = originalItem;
          alert("The image could not be saved. Please try again.");
          return;
        }

        clearPendingImageTarget();
        showMainPage();
        renderDecks();
        return;
      }
      
      // Show modal to choose category and name
      const categoryOptions = deckNames.map(name => `<option value="${name}">${name.charAt(0).toUpperCase() + name.slice(1)}</option>`).join("");
      
      const modalHtml = `
        <div id="image-add-modal" class="modal" style="display: flex;">
          <div class="modal-content">
            <h3>Add Image to Category</h3>
            <div style="margin: 1rem 0;">
              <label for="image-category-select">Category:</label>
              <select id="image-category-select" style="width: 100%; padding: 0.5rem; margin-top: 0.25rem;">
                ${categoryOptions}
              </select>
            </div>
            <div style="margin: 1rem 0;">
              <label for="image-name-input">Item Name (optional):</label>
              <input type="text" id="image-name-input" placeholder="e.g. Red shirt" style="width: 100%; padding: 0.5rem; margin-top: 0.25rem; box-sizing: border-box;" />
            </div>
            <p id="image-add-error" class="form-error hidden" role="alert"></p>
            <div class="modal-actions">
              <button type="button" id="image-add-confirm">Add</button>
              <button type="button" id="image-add-cancel">Cancel</button>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML("beforeend", modalHtml);
      
      const modal = document.getElementById("image-add-modal");
      const categorySelect = document.getElementById("image-category-select");
      const nameInput = document.getElementById("image-name-input");
      const confirmBtn = document.getElementById("image-add-confirm");
      const cancelBtn = document.getElementById("image-add-cancel");
      
      const closeModal = () => {
        modal.remove();
      };
      
      confirmBtn.addEventListener("click", () => {
        const selectedDeck = categorySelect.value;
        const itemName = nameInput.value.trim();
        const errorMessage = document.getElementById("image-add-error");

        // If there is a pending image target (user clicked + on a specific item), replace that item
        const pendingTarget = loadPendingImageTarget();

        imageItem.name = itemName;

        let undoChange;
        let usedPendingTarget = false;
        if (pendingTarget && pendingTarget.deck && Number.isInteger(pendingTarget.index) && decks[pendingTarget.deck]) {
          // Ensure index is within bounds
          const idx = Math.max(0, Math.min(pendingTarget.index, decks[pendingTarget.deck].length - 1));
          const previousItem = decks[pendingTarget.deck][idx];
          decks[pendingTarget.deck][idx] = imageItem;
          undoChange = () => {
            decks[pendingTarget.deck][idx] = previousItem;
          };
          usedPendingTarget = true;
        } else if (selectedDeck && decks[selectedDeck]) {
          decks[selectedDeck].push(imageItem);
          undoChange = () => {
            decks[selectedDeck].pop();
          };
        }

        if (!saveDecks()) {
          undoChange?.();
          if (errorMessage) {
            errorMessage.textContent = "This photo is too large to save here. Try a smaller image, or remove some gallery photos first.";
            errorMessage.classList.remove("hidden");
          }
          return;
        }

        if (usedPendingTarget) {
          clearPendingImageTarget();
        }
        closeModal();
        // Return to the main page so the user sees the newly added item immediately
        showMainPage();
        renderDecks();
      });
      
      cancelBtn.addEventListener("click", closeModal);
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
      });
    });
  });
}

function showFavoritesPage() {
  applyFavoriteHeartColor();
  const searchQuery = favoritesSearchQuery.trim();
  let visibleFavoriteCount = 0;
  const categoriesHtml = deckNames.map((deckName) => {
    const collapsed = Boolean(collapsedDecks[deckName]);
    const title = deckName.charAt(0).toUpperCase() + deckName.slice(1);
    const favorites = decks[deckName]
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => isItemFavorite(item));
    const matchingFavorites = searchQuery
      ? favorites.filter(({ item }) => itemMatchesSearch(item, searchQuery, favoritesSearchType))
      : favorites;
    const hasFavorites = matchingFavorites.length > 0;
    visibleFavoriteCount += matchingFavorites.length;
    if (searchQuery && !hasFavorites) {
      return "";
    }
    const listItems = hasFavorites && !collapsed
      ? matchingFavorites.map(({ item, index }) => {
          const label = getItemLabel(item) || "Unnamed item";
          const imageHtml = isImageEntry(item)
            ? item.imageId
              ? `<img data-image-id="${escapeHtmlAttribute(item.imageId)}" alt="${escapeHtmlAttribute(label)}" />`
              : `<img src="${escapeHtmlAttribute(item.src)}" alt="${escapeHtmlAttribute(label)}" />`
            : "";
          return `
            <li>
              <div class="content">
                ${imageHtml}
                <button type="button" class="favorite-item-details" data-deck="${deckName}" data-index="${index}">${escapeHtmlAttribute(label)}</button>
              </div>
              <button type="button" class="favorite-toggle filled" data-deck="${deckName}" data-index="${index}" aria-label="Unfavorite item">❤</button>
            </li>`;
        }).join("")
      : "";

    return `
      <section class="deck${collapsed ? " collapsed" : ""}" data-deck="${deckName}">
        <div class="deck-header">
          <h2>${title}</h2>
          <div class="header-actions">
            <button type="button" class="collapse-toggle" data-deck="${deckName}" aria-label="${collapsed ? "Expand category" : "Collapse category"}">${collapsed ? "▲" : "▼"}</button>
          </div>
        </div>
        <div class="collapsed-note"></div>
        <ul class="favorites-list">
          ${collapsed ? "" : hasFavorites ? listItems : "<li class=\"empty-message\">No favorites in this category.</li>"}
        </ul>
      </section>`;
  }).join("");
  const favoriteOutfitsHtml = favoriteOutfits.length ? `
    <section class="deck favorite-outfits-deck">
      <div class="deck-header"><h2>Your Favorite Outfits (${favoriteOutfits.length})</h2></div>
      <div class="favorite-outfit-list">
        ${favoriteOutfits.map((outfit, index) => `<button type="button" class="favorite-outfit-card" data-outfit-index="${index}" aria-label="View favorite outfit ${index + 1}"><span class="favorite-outfit-collage" data-outfit-images="${index}"></span><span class="favorite-outfit-name">${escapeHtmlAttribute(outfit.name || `Outfit ${index + 1}`)}</span></button>`).join("")}
      </div>
    </section>` : "";

  document.body.innerHTML = `
    <div class="top-buttons">
      <button type="button" id="menu-button" class="page-switch menu-button" aria-label="Open menu">☰</button>
      <button type="button" id="favorites-back-button" class="page-switch" aria-label="Back">←</button>
    </div>
    <div id="sidebar-backdrop" class="sidebar-backdrop hidden"></div>
    <aside id="sidebar" class="sidebar hidden" aria-hidden="true">
      <button type="button" id="sidebar-close" class="sidebar-close" aria-label="Close menu">×</button>
      <nav class="sidebar-nav" aria-label="Page options">
        <button type="button" id="menu-closet" class="sidebar-item">The Closet</button>
        <button type="button" id="menu-gallery" class="sidebar-item">The Image Gallery</button>
        <button type="button" id="menu-outfit" class="sidebar-item">Outfit Maker</button>
      </nav>
    </aside>
    <main class="favorites-page">
      <div class="favorites-title-row">
        <h2>Favorites</h2>
        <button type="button" id="heart-color-button" class="heart-color-button" aria-label="Choose favorite heart color">♥ ♥ ♥</button>
      </div>
      <div class="search-box">
        <label class="sr-only" for="favorites-search">Search favorite items</label>
        <input id="favorites-search" type="search" placeholder="Search your favorites" autocomplete="off" />
        <label class="search-type-label" for="favorites-search-type">Match</label>
        <select id="favorites-search-type" aria-label="Search type">
          <option value="contains">Contains</option>
          <option value="starts-with">Starts with</option>
        </select>
      </div>
      <p id="favorites-search-empty" class="search-empty${searchQuery && visibleFavoriteCount === 0 ? "" : " hidden"}">No favorite items match that search.</p>
      ${categoriesHtml}
      ${favoriteOutfitsHtml}
    </main>
    <div id="heart-color-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="heart-color-title">
      <div class="modal-content">
        <h2 id="heart-color-title">Heart color</h2>
        <label class="color-picker-label" for="heart-color-input">Choose a color</label>
        <input id="heart-color-input" type="color" value="${escapeHtmlAttribute(loadFavoriteHeartColor())}" />
        <div class="modal-actions">
          <button type="button" id="close-heart-color-button">Done</button>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll(".favorites-page img[data-image-id]").forEach((image) => {
    const imageId = image.dataset.imageId;
    if (imageId) hydrateStoredImage(image, { imageId });
  });

  document.querySelectorAll(".favorite-item-details").forEach((button) => {
    button.addEventListener("click", () => openItemDetails(button.dataset.deck, Number(button.dataset.index), { favoriteOnly: true }));
  });

  document.querySelectorAll(".favorite-outfit-collage").forEach((collage) => {
    const outfit = favoriteOutfits[Number(collage.dataset.outfitImages)];
    (outfit?.items || []).slice(0, 4).forEach((item) => {
      const image = document.createElement("img");
      image.alt = item.name || "outfit item";
      hydrateStoredImage(image, getOutfitSource(item));
      collage.appendChild(image);
    });
  });

  document.querySelectorAll(".favorite-outfit-card").forEach((card) => {
    card.addEventListener("click", () => openFavoriteOutfitDetails(Number(card.dataset.outfitIndex)));
  });

  const menuButton = document.getElementById("menu-button");
  const favoritesBackButton = document.getElementById("favorites-back-button");
  const sidebar = document.getElementById("sidebar");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");
  const sidebarClose = document.getElementById("sidebar-close");
  const menuCloset = document.getElementById("menu-closet");
  const menuGallery = document.getElementById("menu-gallery");
  const menuOutfit = document.getElementById("menu-outfit");
  const favoritesSearch = document.getElementById("favorites-search");
  const favoritesSearchTypeInput = document.getElementById("favorites-search-type");
  const heartColorButton = document.getElementById("heart-color-button");
  const heartColorModal = document.getElementById("heart-color-modal");
  const heartColorInput = document.getElementById("heart-color-input");
  const closeHeartColorButton = document.getElementById("close-heart-color-button");

  if (favoritesSearch) {
    favoritesSearch.value = favoritesSearchQuery;
    favoritesSearch.addEventListener("input", () => {
      favoritesSearchQuery = favoritesSearch.value;
      showFavoritesPage();
      document.getElementById("favorites-search")?.focus();
    });
  }

  if (favoritesSearchTypeInput) {
    favoritesSearchTypeInput.value = favoritesSearchType;
    favoritesSearchTypeInput.addEventListener("change", () => {
      favoritesSearchType = favoritesSearchTypeInput.value;
      showFavoritesPage();
    });
  }

  if (heartColorButton && heartColorModal) {
    heartColorButton.addEventListener("click", () => heartColorModal.classList.remove("hidden"));
  }

  if (heartColorInput) {
    heartColorInput.addEventListener("input", () => {
      saveFavoriteHeartColor(heartColorInput.value);
      applyFavoriteHeartColor(heartColorInput.value);
    });
  }

  if (closeHeartColorButton && heartColorModal) {
    closeHeartColorButton.addEventListener("click", () => heartColorModal.classList.add("hidden"));
  }

  if (heartColorModal) {
    heartColorModal.addEventListener("click", (event) => {
      if (event.target === heartColorModal) heartColorModal.classList.add("hidden");
    });
  }

  const openSidebar = () => {
    sidebar.classList.remove("hidden");
    sidebarBackdrop.classList.remove("hidden");
    sidebar.setAttribute("aria-hidden", "false");
  };

  const closeSidebar = () => {
    sidebar.classList.add("hidden");
    sidebarBackdrop.classList.add("hidden");
    sidebar.setAttribute("aria-hidden", "true");
  };

  if (menuButton) {
    menuButton.addEventListener("click", openSidebar);
  }

  if (sidebarClose) {
    sidebarClose.addEventListener("click", closeSidebar);
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener("click", closeSidebar);
  }

  if (menuCloset) {
    menuCloset.addEventListener("click", () => {
      clearFavoritesSearch();
      showMainPage();
    });
  }

  if (menuGallery) {
    menuGallery.addEventListener("click", () => {
      clearFavoritesSearch();
      closeSidebar();
      showImagesPage();
    });
  }

  if (menuOutfit) {
    menuOutfit.addEventListener("click", () => {
      clearFavoritesSearch();
      closeSidebar();
      showOutfitMaker();
    });
  }

  if (favoritesBackButton) {
    favoritesBackButton.addEventListener("click", () => {
      clearFavoritesSearch();
      showMainPage();
    });
  }

  document.querySelectorAll(".collapse-toggle").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const deckName = button.dataset.deck;
      collapsedDecks[deckName] = !collapsedDecks[deckName];
      saveDecks();
      showFavoritesPage();
    });
  });
}

document.querySelectorAll(".deck").forEach((section) => {
  section.addEventListener("dragstart", handleDeckDragStart);
  section.addEventListener("dragover", handleDeckDragOver);
  section.addEventListener("dragleave", handleDeckDragLeave);
  section.addEventListener("drop", handleDeckDrop);
  section.addEventListener("dragend", handleDeckDragEnd);
});

function openSidebar() {
  const sidebarEl = document.getElementById("sidebar");
  const backdropEl = document.getElementById("sidebar-backdrop");
  if (!sidebarEl || !backdropEl) return;
  sidebarEl.classList.remove("hidden");
  backdropEl.classList.remove("hidden");
  sidebarEl.setAttribute("aria-hidden", "false");
}

function closeSidebar() {
  const sidebarEl = document.getElementById("sidebar");
  const backdropEl = document.getElementById("sidebar-backdrop");
  if (!sidebarEl || !backdropEl) return;
  sidebarEl.classList.add("hidden");
  backdropEl.classList.add("hidden");
  sidebarEl.setAttribute("aria-hidden", "true");
}

async function initializeApp() {
  applyFavoriteHeartColor();
  try {
    await moveExistingPhotosToImageStorage();
  } catch (error) {
    console.error("Could not prepare image storage:", error);
  }
  showMainPage();
  renderDecks();
}

initializeApp();
