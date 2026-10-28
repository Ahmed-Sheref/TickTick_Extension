// Theme-only cache is read before styles paint. Account/token state stays in chrome.storage.
try {
    const theme = localStorage.getItem("knowvia_paint_theme");
    document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
} catch { document.documentElement.dataset.theme = "light"; }
