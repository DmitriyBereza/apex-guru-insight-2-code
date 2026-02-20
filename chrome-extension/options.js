const defaults = {
  classesPath: ""
};

function restore() {
  chrome.storage.sync.get(defaults, (cfg) => {
    document.getElementById("classesPath").value = cfg.classesPath || "";
  });
}

function save() {
  const classesPath = document.getElementById("classesPath").value.trim();

  chrome.storage.sync.set({ classesPath }, () => {
    const status = document.getElementById("status");
    status.textContent = "Saved.";
    setTimeout(() => {
      status.textContent = "";
    }, 1200);
  });
}

document.getElementById("save").addEventListener("click", save);
document.addEventListener("DOMContentLoaded", restore);
