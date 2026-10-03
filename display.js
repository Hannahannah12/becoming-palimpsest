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

    let textPercent = 80;
    const textSlider = document.getElementById('text-scale');
    const sizeLabel = document.getElementById('text-size');
    function applyTextSize() {
        textPercent = Math.max(50, Math.min(120, Number(textSlider.value) || 80));
        stage.style.setProperty('--text-scale', textPercent / 100);
        sizeLabel.value = `${textPercent}%`;
        textSlider.setAttribute('aria-valuetext', `${textPercent}%`);
        fit();
    }
    textSlider.addEventListener('input', applyTextSize);
    // Mouse dragging should fade when the pointer leaves; keyboard focus stays visible.
    textSlider.addEventListener('pointerup', () => textSlider.blur());

    const spacingSlider = document.getElementById('spacing-scale');
    const spacingLabel = document.getElementById('spacing-size');
    let spacing = 1;
    spacingSlider.addEventListener('input', () => {
        const percent = Math.max(0, Math.min(150, Number(spacingSlider.value)));
        spacing = percent / 100;
        spacingLabel.value = `${percent}%`;
        spacingSlider.setAttribute('aria-valuetext', `${percent}%`);
        fit();
    });
    // Share one visibility state for every control, including after pointer clicks.
    const frame = document.querySelector('.control-frame');
    frame.addEventListener('pointerup', event => {
        if (event.target instanceof HTMLElement) event.target.blur();
    });

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
            const baseTop = Math.min(180, height * 0.094);
            const baseGap = Math.max(40, Math.min(680, height * 0.354) - baseTop - topic.offsetHeight);
            // Reserve space for at least two dialogue lines and the bottom frame.
            const requestedSpace = (baseTop + baseGap) * spacing;
            const availableSpace = Math.max(0, height - topic.offsetHeight - 80 - frame.offsetHeight / scale - 120);
            const effectiveSpacing = requestedSpace > availableSpace && requestedSpace > 0
                ? spacing * availableSpace / requestedSpace : spacing;
            topic.style.top = `${baseTop * effectiveSpacing}px`;
            chat.style.top = `${baseTop * effectiveSpacing + topic.offsetHeight + baseGap * effectiveSpacing}px`;
            chat.style.bottom = `${Math.max(80, frame.offsetHeight / scale + 20)}px`;
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
    applyTextSize();
    document.fonts?.ready.then(fit);
})();
