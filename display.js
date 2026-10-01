// Scale all elements together, while allowing the composition to fill any aspect
// ratio. The shorter edge is the reference, so portrait and landscape agree.
(() => {
    const referenceShortEdge = 1080;
    const stage = document.getElementById('artwork-stage');
    if (!stage) return;
    let width = 1920;
    let height = 1080;

    function fit() {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        if (viewportWidth <= 0 || viewportHeight <= 0) return;
        const scale = Math.min(viewportWidth, viewportHeight) / referenceShortEdge;
        width = viewportWidth / scale;
        height = viewportHeight / scale;
        stage.style.width = `${width}px`;
        stage.style.height = `${height}px`;
        stage.style.transform = `scale(${scale})`;

        // Existing detection loops read these dimensions each frame. Changing
        // displays does not restart the camera, dialogue or animation timers.
        const canvas = document.getElementById('detection-canvas');
        if (canvas) {
            const nextWidth = Math.round(width);
            const nextHeight = Math.round(height);
            if (canvas.width !== nextWidth) canvas.width = nextWidth;
            if (canvas.height !== nextHeight) canvas.height = nextHeight;
        }
    }

    window.ArtworkDisplay = Object.freeze({
        get width() { return width; },
        get height() { return height; }
    });
    window.addEventListener('resize', fit);
    document.addEventListener('fullscreenchange', fit);
    fit();
})();
