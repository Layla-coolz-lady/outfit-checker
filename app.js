const STORAGE_KEY = "clothing-decks";
const IMAGE_GALLERY_KEY = "clothing-image-gallery";
const PENDING_IMAGE_SELECTION_KEY = "clothing-pending-image-selection";
const PENDING_IMAGE_TARGET_KEY = "clothing-pending-image-target";
const deckNames = ["shirts", "pants", "shoes"];
const pageSwitchButton = document.getElementById("page-switch");
const imagesSwitchButton = document.getElementById("images-switch");
const defaultDecks = {
  shirts: ["T-shirt", "Button-up"],
  pants: ["Jeans", "Shorts"],
  shoes: ["Sneakers", "Boots"]
};

function isImageUrl(value) {
  return /^https?:\/\//i.test(value);
}

function isDataUrl(value) {
  return /^data:image\//i.test(value);
}

function isImageEntry(value) {
  return typeof value === "object" && value !== null && typeof value.src === "string";
}

let decks = loadDecks();
const imageViewer = document.getElementById("image-viewer");
const viewerImage = document.getElementById("viewer-image");
const editButton = document.getElementById("edit-button");
const editStatus = document.getElementById("edit-status");
const editDots = document.getElementById("edit-dots");
let editMode = false;
let dotAnimationTimer = null;
let draggedItem = null;

function setEditMode(isActive) {
  editMode = isActive;
  editButton.textContent = isActive ? "Finish" : "Edit";
  editButton.classList.toggle("active", isActive);
  editStatus.classList.toggle("active", isActive);

  document.querySelectorAll(".deck").forEach((deck) => {
    deck.classList.toggle("edit-mode", isActive);
  });

  [pageSwitchButton, imagesSwitchButton].forEach((button) => {
    button.classList.toggle("hidden", isActive);
  });

  renderDecks();

  if (dotAnimationTimer) {
    clearInterval(dotAnimationTimer);
    dotAnimationTimer = null;
  }

  if (isActive) {
    const sequence = [".", "..", "...", " "];
    let dotIndex = 0;
    editDots.textContent = sequence[0];

    dotAnimationTimer = setInterval(() => {
      dotIndex = (dotIndex + 1) % sequence.length;
      editDots.textContent = sequence[dotIndex];
    }, 500);
  } else {
    editDots.textContent = ".";
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
    } else if (isImageEntry(item)) {
      decks[deckName][index] = { ...item, name: nextValue };
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

function loadDecks() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { ...defaultDecks };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      shirts: Array.isArray(parsed.shirts) ? parsed.shirts : defaultDecks.shirts,
      pants: Array.isArray(parsed.pants) ? parsed.pants : defaultDecks.pants,
      shoes: Array.isArray(parsed.shoes) ? parsed.shoes : defaultDecks.shoes
    };
  } catch {
    return { ...defaultDecks };
  }
}

function saveDecks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
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
  localStorage.setItem(IMAGE_GALLERY_KEY, JSON.stringify(images));
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

function renderDecks() {
  deckNames.forEach((deckName) => {
    const list = document.getElementById(`${deckName}-list`);
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

      row.appendChild(content);
      list.appendChild(row);
    });
  });
}

document.querySelectorAll(".item-form").forEach((form) => {
  const submitButton = form.querySelector("button[type='submit']");

  submitButton.addEventListener("click", (event) => {
    event.preventDefault();
    const deckName = form.dataset.deck;
    const textInput = form.querySelector("input[type='text']");
    const value = textInput.value.trim();

    if (!value || /^https?:\/\//i.test(value)) {
      return;
    }

    decks[deckName].push(value);
    saveDecks();
    renderDecks();
    form.reset();
  });
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-deck]");
  if (button) {
    const deckName = button.dataset.deck;
    const index = Number(button.dataset.index);

    if (button.classList.contains("add-photo-button")) {
      savePendingImageTarget({ deck: deckName, index });
      showImagesPage();
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
  viewerImage.src = src;
  imageViewer.classList.add("active");
  imageViewer.setAttribute("aria-hidden", "false");
}

function closeViewer() {
  imageViewer.classList.remove("active");
  imageViewer.setAttribute("aria-hidden", "true");
  viewerImage.src = "";
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeViewer();
  }
});

function showBlankPage(message) {
  document.body.innerHTML = `
    <div class="blank-page">
      <div>
        <p>${message}</p>
        <button id="return-button" class="page-switch">Back</button>
      </div>
    </div>
  `;
  document.getElementById("return-button").addEventListener("click", () => {
    window.location.reload();
  });
}

function showImagesPage() {
  const gallery = loadGallery();
  document.body.innerHTML = `
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
      <button id="return-button" class="page-switch">Back</button>
    </div>
  `;

  document.getElementById("gallery-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("gallery-url");
    const value = input.value.trim();
    if (!value) {
      return;
    }

    const nextGallery = [...gallery, value];
    saveGallery(nextGallery);
    showImagesPage();
  });

  document.querySelectorAll(".gallery-use").forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.src;
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
      window.location.href = "/";
    });
  });

  document.getElementById("return-button").addEventListener("click", () => {
    window.location.reload();
  });
}

pageSwitchButton.addEventListener("click", () => {
  showBlankPage("My Favorites");
});

imagesSwitchButton.addEventListener("click", () => {
  showImagesPage();
});

editButton.addEventListener("click", () => {
  if (editMode) {
    saveEditedNames();
  }

  setEditMode(!editMode);
});

setEditMode(false);
renderDecks();
applyPendingSelection();
