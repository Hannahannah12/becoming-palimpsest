/* Camera-derived ink paths. No changes to the ink renderer or trail decay. */
(() => {
    function silhouette(segmentation) {
        const {data, width, height} = segmentation;
        const step = Math.max(1, Math.ceil(Math.max(width, height) / 320));
        const w = Math.ceil(width / step), h = Math.ceil(height / step);
        const mask = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let votes = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const sx = Math.max(0, Math.min(width - 1, x * step + dx));
                const sy = Math.max(0, Math.min(height - 1, y * step + dy));
                votes += data[sy * width + sx] === 1 ? 1 : 0;
            }
            mask[y * w + x] = votes >= 5 ? 1 : 0;
        }
        // Directed cell boundaries keep disconnected silhouettes separate.
        // Do not draw the edge of the camera frame when a person is cropped.
        const edges = [], outgoing = new Map();
        const key = (x, y) => y * (w + 1) + x;
        const add = (x, y, nx, ny) => {
            const edge = {x, y, nx, ny, used: false};
            edges.push(edge);
            const k = key(x, y);
            if (!outgoing.has(k)) outgoing.set(k, []);
            outgoing.get(k).push(edge);
        };
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (!mask[y * w + x]) continue;
            if (y > 0 && !mask[(y - 1) * w + x]) add(x, y, x + 1, y);
            if (x < w - 1 && !mask[y * w + x + 1]) add(x + 1, y, x + 1, y + 1);
            if (y < h - 1 && !mask[(y + 1) * w + x]) add(x + 1, y + 1, x, y + 1);
            if (x > 0 && !mask[y * w + x - 1]) add(x, y + 1, x, y);
        }
        const paths = [];
        // Begin open contours at their source so frame-clipped paths stay whole.
        const incoming = new Set(edges.map(e => key(e.nx, e.ny)));
        const ordered = [...edges.filter(e => !incoming.has(key(e.x, e.y))), ...edges];
        for (const start of ordered) {
            if (start.used) continue;
            let edge = start;
            const points = [{x: edge.x * step, y: edge.y * step}];
            while (edge && !edge.used) {
                edge.used = true;
                points.push({x: edge.nx * step, y: edge.ny * step});
                const candidates = (outgoing.get(key(edge.nx, edge.ny)) || []).filter(e => !e.used);
                const dx = edge.nx - edge.x, dy = edge.ny - edge.y;
                // Right turns at a diagonal contact avoid joining two people.
                candidates.sort((a, b) => {
                    const rank = e => dx * (e.ny - e.y) - dy * (e.nx - e.x);
                    return rank(b) - rank(a);
                });
                edge = candidates[0];
            }
            if (points.length < 16) continue;
            paths.push(points.filter((_, i) => i % 2 === 0 || i === points.length - 1));
        }
        return paths;
    }

    let faceCanvas, faceContext;
    function facialPaths(video, segmentation) {
        const paths = [];
        if (!video || video.readyState < 2) return paths;
        if (!faceCanvas) {
            faceCanvas = document.createElement('canvas');
            faceCanvas.width = 80; faceCanvas.height = 80;
            faceContext = faceCanvas.getContext('2d', {willReadFrequently: true});
        }
        for (const pose of (segmentation.allPoses || []).slice(0, 4)) {
            const points = Object.fromEntries(pose.keypoints.map(p => [p.part, p]));
            let left = points.leftEye, right = points.rightEye;
            if (!left || !right || left.score < .65 || right.score < .65 || points.nose?.score < .65) continue;
            if (left.position.x > right.position.x) [left, right] = [right, left];
            const dx = right.position.x - left.position.x, dy = right.position.y - left.position.y;
            const distance = Math.hypot(dx, dy);
            if (distance < 18) continue;
            const ux = dx / distance, uy = dy / distance;
            const cx = (left.position.x + right.position.x) / 2;
            const cy = (left.position.y + right.position.y) / 2;
            const scale = 40 / distance;
            // Normalize a small face crop around the eyes; its pixels stay local.
            faceContext.setTransform(scale * ux, -scale * uy, scale * uy, scale * ux,
                40 - scale * (ux * cx + uy * cy), 24 - scale * (-uy * cx + ux * cy));
            faceContext.filter = 'blur(1px)';
            faceContext.drawImage(video, 0, 0, segmentation.width, segmentation.height);
            faceContext.setTransform(1, 0, 0, 1, 0, 0);
            faceContext.filter = 'none';
            const pixels = faceContext.getImageData(0, 0, 80, 80).data;
            const gray = new Float32Array(6400), magnitude = new Float32Array(6400);
            const gx = new Float32Array(6400), gy = new Float32Array(6400);
            for (let i = 0; i < 6400; i++) gray[i] = pixels[i * 4] * .299 + pixels[i * 4 + 1] * .587 + pixels[i * 4 + 2] * .114;
            for (let y = 1; y < 79; y++) for (let x = 1; x < 79; x++) {
                const i = y * 80 + x;
                gx[i] = gray[i - 79] + 2 * gray[i + 1] + gray[i + 81] - gray[i - 81] - 2 * gray[i - 1] - gray[i + 79];
                gy[i] = gray[i + 79] + 2 * gray[i + 80] + gray[i + 81] - gray[i - 81] - 2 * gray[i - 80] - gray[i - 79];
                magnitude[i] = Math.hypot(gx[i], gy[i]);
            }
            // Small real-image regions for eyes/brows, nose, and mouth, not drawn facial templates.
            const regions = [[9, 15, 31, 31], [49, 15, 71, 31], [30, 32, 50, 51], [23, 51, 57, 68]];
            for (const [x0, y0, x1, y1] of regions) {
                const strengths = [];
                for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) strengths.push(magnitude[y * 80 + x]);
                strengths.sort((a, b) => a - b);
                const threshold = Math.max(35, strengths[Math.floor(strengths.length * .8)]);
                const edgePixels = new Set();
                for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                    const i = y * 80 + x;
                    const ax = Math.abs(gx[i]), ay = Math.abs(gy[i]);
                    const direction = ax > ay * 2 ? 1 : ay > ax * 2 ? 80 : gx[i] * gy[i] > 0 ? 81 : 79;
                    if (magnitude[i] >= threshold && magnitude[i] >= magnitude[i - direction] && magnitude[i] >= magnitude[i + direction]) edgePixels.add(i);
                }
                const candidates = [];
                while (edgePixels.size) {
                    let current = edgePixels.values().next().value;
                    const chain = [];
                    while (current !== undefined) {
                        edgePixels.delete(current);
                        chain.push(current);
                        current = [-1, 1, -80, 80, -81, -79, 79, 81].map(d => current + d).find(i => edgePixels.has(i));
                    }
                    if (chain.length >= 6) candidates.push(chain);
                }
                candidates.sort((a, b) => b.length - a.length);
                for (const chain of candidates.slice(0, 2)) {
                    const path = chain.filter((_, i) => i % 2 === 0).map(i => {
                        const x = (i % 80 - 40) / scale, y = (Math.floor(i / 80) - 24) / scale;
                        return {x: cx + ux * x - uy * y, y: cy + uy * x + ux * y};
                    });
                    if (path.every(p => {
                        const x = Math.round(p.x), y = Math.round(p.y);
                        return x >= 0 && x < segmentation.width && y >= 0 && y < segmentation.height && segmentation.data[y * segmentation.width + x] === 1;
                    })) paths.push(path);
                }
            }
        }
        return paths;
    }
    globalThis.InkTrajectories = {silhouette, facialPaths};
})();
