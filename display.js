// Scale all elements together, while allowing the composition to fill any aspect
// ratio. The shorter edge is the reference, so portrait and landscape agree.
(() => {
    // 36px exhibition text at a 1440px short edge: 2.5% of the viewport.
    // CSS viewport pixels avoid treating Retina density as physical screen size.
    const referenceShortEdge = 1440;
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

        // Preserve the exhibition's spacing, moving dialogue down only when
        // the topic wraps farther on a narrow screen.
        const topic = document.getElementById('topic-header');
        const chat = document.getElementById('chat-container');
        if (topic && chat) {
            topic.style.top = `${Math.min(180, height * 0.094)}px`;
            const topicBottom = topic.offsetTop + topic.offsetHeight;
            chat.style.top = `${Math.max(Math.min(680, height * 0.354), topicBottom + 40)}px`;
        }

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
        fit,
        get width() { return width; },
        get height() { return height; }
    });
    window.addEventListener('resize', fit);
    document.addEventListener('fullscreenchange', fit);
    fit();
    document.fonts?.ready.then(fit);
})();
