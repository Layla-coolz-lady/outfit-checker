const STORAGE_KEY = "clothing-decks";
const IMAGE_GALLERY_KEY = "clothing-image-gallery";
const FAVORITE_HEART_COLOR_KEY = "favorite-heart-color";
const PENDING_IMAGE_SELECTION_KEY = "clothing-pending-image-selection";
const PENDING_IMAGE_TARGET_KEY = "clothing-pending-image-target";
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
  return typeof value === "object" && value !== null && typeof value.src === "string";
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

let decks = loadDecks();
let imageViewer = document.getElementById("image-viewer");
let viewerImage = document.getElementById("viewer-image");
let editButton = document.getElementById("edit-button");
let addCategoryButton = document.getElementById("add-category-button");
let editStatus = document.getElementById("edit-status");
let editDots = document.getElementById("edit-dots");
let appShell = document.querySelector(".app-shell");
let editMode = false;
let dotAnimationTimer = null;
let draggedItem = null;
let draggedDeck = null;
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...decks,
    deckOrder: deckNames,
    collapsedDecks
  }));
}

function openDeleteConfirmation(deckName) {
  pendingDeckDelete = deckName;
  if (deleteConfirmation) {
    deleteConfirmation.classList.remove("hidden");
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
  const uniqueImages = Array.from(new Set([...existing, ...images]));
  localStorage.setItem(IMAGE_GALLERY_KEY, JSON.stringify(uniqueImages));
}

function loadFavoriteHeartColor() {
  const color = localStorage.getItem(FAVORITE_HEART_COLOR_KEY);
  return color || "#d43d4a";
}

function saveFavoriteHeartColor(color) {
  localStorage.setItem(FAVORITE_HEART_COLOR_KEY, color);
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
  deckGrid.innerHTML = "";

  deckNames.forEach((deckName) => {
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
      const title = deckName.charAt(0).toUpperCase() + deckName.slice(1);
      header.textContent = `${title} (${decks[deckName] ? decks[deckName].length : 0})`;
    }

    if (collapsedNote) {
      collapsedNote.textContent = collapsedDecks[deckName] && editMode
        ? "Drag to reorder"
        : "";
    }

    list.innerHTML = "";

    decks[deckName].forEach((item, index) => {
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
        image.src = item.src;
        image.alt = "clothing item";
        image.addEventListener("click", () => openViewer(item.src));
        imageGroup.appendChild(image);

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
          label.textContent = item.name;
          imageGroup.appendChild(label);
        }

        content.appendChild(imageGroup);
      } else if (isImageUrl(item) || isDataUrl(item)) {
        const image = document.createElement("img");
        image.src = item;
        image.alt = "clothing item";
        image.addEventListener("click", () => openViewer(item));
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
          label.textContent = item.text;
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
          label.textContent = item;
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

        if (!isImageEntry(item) && !(isImageUrl(item) || isDataUrl(item))) {
          const addPhotoButton = document.createElement("button");
          addPhotoButton.type = "button";
          addPhotoButton.className = "add-photo-button";
          addPhotoButton.textContent = "+";
          addPhotoButton.dataset.deck = deckName;
          addPhotoButton.dataset.index = index;
          row.appendChild(addPhotoButton);
        }
      }

      list.appendChild(row);
    });

    deckGrid.appendChild(section);
  });
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
  const confirmDeleteButton = document.getElementById("confirm-delete-button");
  const cancelDeleteButton = document.getElementById("cancel-delete-button");
  const deleteConfirmationElement = document.getElementById("delete-confirmation");

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

  if (menuOutfit) {
    menuOutfit.addEventListener("click", () => {
      closeSidebar();
      showBlankPage("Outfit Maker");
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
  const name = window.prompt("New category name:");
  if (!name) {
    return;
  }

  const normalizedKey = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
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
  renderDecks();
}

function showMainPage() {
  document.body.innerHTML = `
    <div class="top-buttons">
      <button type="button" id="menu-button" class="page-switch menu-button" aria-label="Open menu">☰</button>
      <button type="button" id="edit-button" class="page-switch edit-button">Edit</button>
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
      <div class="deck-grid"></div>
    </main>
    <div id="image-viewer" class="image-viewer" aria-hidden="true">
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

    if (button.classList.contains("favorite-toggle")) {
      return;
    }

    if (Number.isInteger(index) && decks[deckName]) {
      decks[deckName].splice(index, 1);
      saveDecks();
      renderDecks();
    }
    return;
  }

  if (event.target === imageViewer) {
    closeViewer();
  }
});

function openViewer(src) {
  const imageViewerElement = document.getElementById("image-viewer");
  const viewerImageElement = document.getElementById("viewer-image");
  if (!imageViewerElement || !viewerImageElement) {
    return;
  }
  viewerImageElement.src = src;
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
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeViewer();
  }
});

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
      <h2>The Image Gallery</h2>
      <form id="gallery-form">
        <input id="gallery-url" type="text" placeholder="Paste image URL" />
        <button type="submit">Add image</button>
      </form>
      <div class="gallery-list">
        ${gallery.length ? gallery.map((src) => `
          <div class="gallery-item">
            <img src="${src}" alt="gallery item" />
            <button class="gallery-use" data-src="${src}" data-deck="shirts">Use image</button>
          </div>
        `).join("") : "<p>No images yet.</p>"}
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
      showBlankPage("Outfit Maker");
    });
  }

  if (pageBackButton) {
    pageBackButton.addEventListener("click", () => {
      showMainPage();
    });
  }

  document.getElementById("gallery-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("gallery-url");
    const value = input.value.trim();
    if (!value) {
      return;
    }

    saveGallery([value]);
    showImagesPage();
  });

  document.querySelectorAll(".gallery-use").forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.src;
      ensureGalleryImage(value);
      const target = loadPendingImageTarget();

      if (target) {
        const existingItem = decks[target.deck][target.index];
        const existingName = typeof existingItem === "string"
          ? existingItem
          : existingItem && existingItem.name
            ? existingItem.name
            : "";

        decks[target.deck][target.index] = { src: value, name: existingName };
        clearPendingImageTarget();
      } else {
        decks[button.dataset.deck].push({ src: value, name: "" });
      }

      saveDecks();
      showMainPage();
    });
  });
}

function showFavoritesPage() {
  const categoriesHtml = deckNames.map((deckName) => {
    const collapsed = Boolean(collapsedDecks[deckName]);
    const title = deckName.charAt(0).toUpperCase() + deckName.slice(1);
    const favorites = decks[deckName]
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => isItemFavorite(item));
    const hasFavorites = favorites.length > 0;
    const listItems = hasFavorites && !collapsed
      ? favorites.map(({ item, index }) => {
          const label = getItemLabel(item) || "Unnamed item";
          const imageHtml = isImageEntry(item)
            ? `<img src="${item.src}" alt="${label}" />`
            : "";
          return `
            <li>
              <div class="content">
                ${imageHtml}
                <span>${label}</span>
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
      <h2>Favorites</h2>
      ${categoriesHtml}
    </main>
  `;

  const menuButton = document.getElementById("menu-button");
  const favoritesBackButton = document.getElementById("favorites-back-button");
  const sidebar = document.getElementById("sidebar");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");
  const sidebarClose = document.getElementById("sidebar-close");
  const menuCloset = document.getElementById("menu-closet");
  const menuGallery = document.getElementById("menu-gallery");
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
      showMainPage();
    });
  }

  if (menuGallery) {
    menuGallery.addEventListener("click", () => {
      closeSidebar();
      showImagesPage();
    });
  }

  if (menuOutfit) {
    menuOutfit.addEventListener("click", () => {
      closeSidebar();
      showBlankPage("Outfit Maker");
    });
  }

  if (favoritesBackButton) {
    favoritesBackButton.addEventListener("click", () => {
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

showMainPage();
renderDecks();

