// Zentrale Modal-Hilfsfunktionen für alle Module
export function showModal(html) {
    let modal = document.getElementById("modal-root");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "modal-root";
        document.body.appendChild(modal);
    }
    modal.innerHTML = `
        <div class="modal" onclick="window.hideModal && window.hideModal()">
            <div class="modal-content" onclick="event.stopPropagation();">${html}</div>
        </div>
    `;
    window.hideModal = hideModal;
}
export function hideModal() {
    let modal = document.getElementById("modal-root");
    if (modal) modal.innerHTML = "";
}