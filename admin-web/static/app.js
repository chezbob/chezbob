// Encapsulate the application state and behavior away from the global scope.
(() => {
  "use strict";

  const SCAN_INTERVAL_MS = 100;
  const CAMERA_RECOVERY_INTERVAL_MS = 400;
  const AUTO_REVIEW_DELAY_MS = 300;
  const CAMERA_WARMUP_MS = 350;
  const CAMERA_CONFIRMATION_FRAMES = 2;
  const CAMERA_CONFIRMATION_WINDOW_MS = 1500;
  const CAMERA_CROP_MARGIN_X = 0.08;
  const CAMERA_CROP_MARGIN_Y = 0.1;
  const config = window.CHEZBOB_CONFIG;
  if (!config) {
    throw new Error("The scanner configuration could not be loaded.");
  }

  // Map kebab-case DOM IDs to underscore-named element references.
  const elements = Object.fromEntries(
    [
      "home-button", "capture-progress", "details-progress",
      "scan-view", "details-view", "camera-button", "stop-button", "camera-stage",
      "camera-preview", "camera-placeholder", "scan-frame", "live-indicator",
      "image-input", "no-barcode-button", "manual-form", "manual-barcode", "scanner-message",
      "scan-more-button",
      "product-forms", "product-form-template",
    ].map((id) => [id.replaceAll("-", "_"), document.querySelector(`#${id}`)]),
  );

  const captures = new Map();
  let reader;
  let retailReader;
  let autoReviewTimer;
  let cameraFrameTimer;
  let cameraSession = 0;
  let cameraStream;
  let imageDecodeSession = 0;
  let currentView = "scan";

  // Apply server-provided validation and pricing settings to the form template.
  function applyConfiguration() {
    elements.manual_barcode.maxLength = config.maxBarcodeLength;
    const template = elements.product_form_template.content;
    template.querySelector('[data-role="tax-description"]').textContent =
      `${new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 3,
      }).format(config.salesTaxRate)} sales tax applies`;
    template.querySelector('[data-role="crv-description"]').textContent =
      `${new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(config.crvCentsPerUnit / 100)} per unit`;

    template.querySelector('[name="name"]').maxLength =
      config.maxProductNameLength;
    template.querySelector('[name="whole_price"]').max =
      (config.maxWholePriceCents / 100).toFixed(2);
    template.querySelector('[name="count"]').max = config.maxUnitCount;
  }

  // Display a status message beneath the scanner controls.
  function setScannerMessage(message, tone = "") {
    elements.scanner_message.textContent = message;
    elements.scanner_message.className = `scanner-message ${tone}`.trim();
  }

  // Display a status message within a product form.
  function setFormMessage(form, message, tone = "") {
    const element = form.querySelector(".form-message");
    element.textContent = message;
    element.className = `form-message ${tone}`.trim();
  }

  // Update the camera button and live-status labels.
  function setCameraLabels(buttonIcon, buttonLabel, statusLabel) {
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = buttonIcon;
    elements.camera_button.replaceChildren(icon, ` ${buttonLabel}`);

    const indicator = document.createElement("i");
    elements.live_indicator.replaceChildren(indicator, ` ${statusLabel}`);
  }

  // Build ZXing decoder hints for the requested barcode formats.
  function decoderHints(possibleFormats) {
    const hints = new Map([
      [window.ZXing.DecodeHintType.TRY_HARDER, true],
    ]);
    if (possibleFormats) {
      hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, possibleFormats);
    }
    return hints;
  }

  // Return the barcode formats commonly used on retail products.
  function retailFormats() {
    return [
      window.ZXing.BarcodeFormat.UPC_E,
      window.ZXing.BarcodeFormat.UPC_A,
      window.ZXing.BarcodeFormat.EAN_13,
      window.ZXing.BarcodeFormat.EAN_8,
    ];
  }

  // Lazily create and return a reusable ZXing browser reader.
  function getReader(retailOnly = false) {
    if (
      !window.ZXingBrowser?.BrowserMultiFormatReader ||
      !window.ZXing?.MultiFormatReader
    ) {
      throw new Error("The scanner library could not be loaded. Reload the page.");
    }
    if (retailOnly) {
      if (!retailReader) {
        retailReader = new window.ZXingBrowser.BrowserMultiFormatReader(
          decoderHints(retailFormats()),
          {
            delayBetweenScanAttempts: SCAN_INTERVAL_MS,
            delayBetweenScanSuccess: SCAN_INTERVAL_MS,
          },
        );
      }
      return retailReader;
    }
    if (!reader) {
      reader = new window.ZXingBrowser.BrowserMultiFormatReader(
        decoderHints(),
        {
          delayBetweenScanAttempts: SCAN_INTERVAL_MS,
          delayBetweenScanSuccess: SCAN_INTERVAL_MS,
        },
      );
    }
    return reader;
  }

  // Invalidate any active image decode and reset the file input.
  function cancelPendingImageDecode() {
    imageDecodeSession += 1;
    elements.image_input.value = "";
  }

  // Stop camera activity and restore the inactive scanner interface.
  function stopCamera() {
    cameraSession += 1;
    window.clearTimeout(autoReviewTimer);
    autoReviewTimer = undefined;
    window.clearTimeout(cameraFrameTimer);
    cameraFrameTimer = undefined;
    const streams = new Set([
      cameraStream,
      elements.camera_preview.srcObject,
    ]);
    for (const stream of streams) {
      for (const track of stream?.getTracks?.() || []) track.stop();
    }
    cameraStream = undefined;
    elements.camera_preview.pause();
    elements.camera_preview.srcObject = null;
    elements.camera_preview.removeAttribute("src");
    elements.camera_preview.load();
    elements.camera_stage.classList.remove("active");
    elements.camera_placeholder.classList.remove("hidden");
    elements.scan_frame.classList.add("hidden");
    elements.stop_button.classList.add("hidden");
    elements.camera_button.disabled = false;
    setCameraLabels("▣", "Start camera", "Camera off");
    elements.live_indicator.classList.remove("live");
  }

  // Identify normal ZXing failures that mean no valid code was found.
  function expectedDecodeError(error) {
    return ["NotFoundException", "ChecksumException", "FormatException"]
      .includes(error?.getKind?.() || error?.constructor?.name);
  }

  // Copy the visible scan target from the camera preview into a canvas.
  function cameraCrop(video, canvas) {
    const videoRect = video.getBoundingClientRect();
    const frameRect = elements.scan_frame.getBoundingClientRect();
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight || !videoRect.width || !videoRect.height) {
      throw new Error("The camera has not produced a usable frame.");
    }

    // The preview uses object-fit: cover. Map the visible targeting rectangle
    // back into intrinsic video coordinates before decoding.
    const scale = Math.max(
      videoRect.width / sourceWidth,
      videoRect.height / sourceHeight,
    );
    const renderedWidth = sourceWidth * scale;
    const renderedHeight = sourceHeight * scale;
    const offsetX = (videoRect.width - renderedWidth) / 2;
    const offsetY = (videoRect.height - renderedHeight) / 2;
    const sourceX = Math.max(
      0,
      (
        frameRect.left
        - videoRect.left
        - videoRect.width * CAMERA_CROP_MARGIN_X
        - offsetX
      ) / scale,
    );
    const sourceY = Math.max(
      0,
      (
        frameRect.top
        - videoRect.top
        - videoRect.height * CAMERA_CROP_MARGIN_Y
        - offsetY
      ) / scale,
    );
    const cropWidth = Math.min(
      sourceWidth - sourceX,
      (
        frameRect.width
        + 2 * videoRect.width * CAMERA_CROP_MARGIN_X
      ) / scale,
    );
    const cropHeight = Math.min(
      sourceHeight - sourceY,
      (
        frameRect.height
        + 2 * videoRect.height * CAMERA_CROP_MARGIN_Y
      ) / scale,
    );
    canvas.width = Math.max(1, Math.round(cropWidth));
    canvas.height = Math.max(1, Math.round(cropHeight));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("The camera frame could not be prepared.");
    context.drawImage(
      video,
      sourceX,
      sourceY,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }

  // Try a sequence of ZXing decoding strategies against one or more canvases.
  function decodeCanvasWithCore(canvases, attempts) {
    let lastError;
    for (const candidateCanvas of canvases) {
      for (const [Binarizer, pureBarcode, possibleFormats] of attempts) {
        try {
          const source = new window.ZXing.HTMLCanvasElementLuminanceSource(
            candidateCanvas,
          );
          const bitmap = new window.ZXing.BinaryBitmap(new Binarizer(source));
          const hints = decoderHints(possibleFormats);
          if (pureBarcode) {
            hints.set(window.ZXing.DecodeHintType.PURE_BARCODE, true);
          }
          return new window.ZXing.MultiFormatReader().decode(bitmap, hints);
        } catch (error) {
          lastError = error;
        }
      }
    }
    throw lastError || new Error("No supported barcode was found.");
  }

  // Decode a live camera frame with fast readers and optional recovery passes.
  function decodeCameraCanvas(canvas, useRecovery) {
    let lastError;
    try {
      return getReader(true).decodeFromCanvas(canvas);
    } catch (error) {
      if (!expectedDecodeError(error)) throw error;
      lastError = error;
    }
    try {
      return getReader().decodeFromCanvas(canvas);
    } catch (error) {
      if (!expectedDecodeError(error)) throw error;
      lastError = error;
    }
    if (!useRecovery) throw lastError;
    return decodeCanvasWithCore(
      [
        addQuietZone(canvas),
        addQuietZone(canvas, "grayscale(1) contrast(180%)"),
      ],
      [
        [window.ZXing.GlobalHistogramBinarizer, false, retailFormats()],
        [window.ZXing.HybridBinarizer, false, retailFormats()],
        [window.ZXing.GlobalHistogramBinarizer, true, retailFormats()],
      ],
    );
  }

  // Start the timed loop that captures and decodes live camera frames.
  function beginCameraScanning(session) {
    const video = elements.camera_preview;
    const canvas = document.createElement("canvas");
    const startedAt = performance.now();
    let lastScanAt = 0;
    let lastRecoveryAt = -Infinity;
    let candidate = "";
    let candidateCount = 0;
    let candidateSeenAt = 0;

    // Stop the active scan session and report an unexpected camera error.
    const fail = (error) => {
      if (session !== cameraSession) return;
      stopCamera();
      setScannerMessage(
        error?.message || "Camera scanning stopped unexpectedly. Start it again.",
        "error",
      );
    };

    // Decode the current camera frame when the scan interval permits.
    const scanFreshFrame = (now) => {
      if (session !== cameraSession || currentView !== "scan") {
        return;
      }
      if (now - startedAt < CAMERA_WARMUP_MS || now - lastScanAt < SCAN_INTERVAL_MS) {
        return;
      }
      lastScanAt = now;
      try {
        cameraCrop(video, canvas);
        const useRecovery =
          now - lastRecoveryAt >= CAMERA_RECOVERY_INTERVAL_MS;
        if (useRecovery) lastRecoveryAt = now;
        const result = decodeCameraCanvas(canvas, useRecovery);
        const barcode = cleanBarcode(result.getText());
        const format = resultFormat(result);
        const fingerprint = `${format}\u0000${barcode}`;
        if (
          fingerprint === candidate &&
          now - candidateSeenAt <= CAMERA_CONFIRMATION_WINDOW_MS
        ) {
          candidateCount += 1;
        } else {
          candidate = fingerprint;
          candidateCount = 1;
        }
        candidateSeenAt = now;
        if (
          candidateCount >= CAMERA_CONFIRMATION_FRAMES &&
          addCapture(barcode, "camera", format)
        ) {
          candidate = "";
          candidateCount = 0;
          queueAutomaticReview();
        }
      } catch (error) {
        if (!expectedDecodeError(error)) {
          fail(error);
        } else if (now - candidateSeenAt > CAMERA_CONFIRMATION_WINDOW_MS) {
          candidate = "";
          candidateCount = 0;
        }
      }
    };

    // Schedule repeated camera-frame scans until the session ends.
    const scheduleTimerFrame = () => {
      if (session !== cameraSession || currentView !== "scan") return;
      scanFreshFrame(performance.now());
      cameraFrameTimer = window.setTimeout(scheduleTimerFrame, SCAN_INTERVAL_MS);
    };

    scheduleTimerFrame();
  }

  // Request the rear camera and begin live barcode scanning.
  async function startCamera() {
    stopCamera();
    cancelPendingImageDecode();
    const session = cameraSession;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setScannerMessage(
        "Firefox requires HTTPS for camera access. Reopen with an https:// address, or use Upload image.",
        "error",
      );
      return;
    }
    setScannerMessage("Requesting camera access…");
    elements.camera_button.disabled = true;
    elements.camera_button.textContent = "Starting…";
    try {
      const preferredConstraints = {
        audio: false,
        video: {
          facingMode: { exact: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
      } catch (error) {
        if (!["NotFoundError", "OverconstrainedError"].includes(error.name)) {
          throw error;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
      }
      if (session !== cameraSession || currentView !== "scan") {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      cameraStream = stream;
      for (const track of stream.getVideoTracks()) {
        const capabilities = track.getCapabilities?.();
        if (
          capabilities?.focusMode?.includes("continuous") &&
          typeof track.applyConstraints === "function"
        ) {
          try {
            await track.applyConstraints({
              advanced: [{ focusMode: "continuous" }],
            });
          } catch (error) {
            console.info("Continuous camera focus is unavailable.", error);
          }
        }
        // Reset the scanner if the browser ends the camera track.
        track.addEventListener("ended", () => {
          if (session !== cameraSession) return;
          stopCamera();
          setScannerMessage("The camera stream ended. Start the camera again.", "error");
        }, { once: true });
      }
      elements.camera_preview.srcObject = stream;
      await elements.camera_preview.play();
      if (session !== cameraSession || currentView !== "scan") {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      elements.camera_stage.classList.add("active");
      elements.camera_placeholder.classList.add("hidden");
      elements.scan_frame.classList.remove("hidden");
      elements.stop_button.classList.remove("hidden");
      setCameraLabels("●", "Scanning", "Live scan");
      elements.live_indicator.classList.add("live");
      setScannerMessage("Hold a code inside the frame until it is confirmed.");
      beginCameraScanning(session);
    } catch (error) {
      if (session !== cameraSession) return;
      stopCamera();
      const messages = {
        NotAllowedError: "Camera access was denied. Allow it in browser settings or upload an image.",
        NotFoundError: "No camera was found. Upload a barcode image instead.",
        NotReadableError: "The camera is busy in another app. Close it there and try again.",
        SecurityError: "Camera access requires HTTPS (or localhost).",
      };
      setScannerMessage(messages[error.name] || error.message || "The camera could not be started.", "error");
    }
  }

  // Decode a barcode from an image selected by the user.
  async function decodeImage(file) {
    if (!file) return;
    const session = ++imageDecodeSession;
    stopCamera();
    setScannerMessage("Reading barcode image…");
    const objectUrl = URL.createObjectURL(file);
    try {
      const result = await decodeStillImage(objectUrl);
      if (session !== imageDecodeSession || currentView !== "scan") return;
      if (addCapture(result.getText(), "image", resultFormat(result))) {
        showDetailsView();
      }
    } catch (error) {
      console.error("Barcode image decoding failed.", error);
      if (session === imageDecodeSession && currentView === "scan") {
        setScannerMessage("No supported barcode was found. Try a sharper, closer photo.", "error");
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
      if (session === imageDecodeSession) elements.image_input.value = "";
    }
  }

  // Load an image into canvases and run the full decoding strategy.
  async function decodeStillImage(url) {
    if (!window.ZXing) {
      throw new Error("The still-image decoder could not be loaded.");
    }
    const image = new Image();
    image.src = url;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("The image could not be prepared.");
    context.drawImage(image, 0, 0);
    const paddedCanvas = addQuietZone(canvas);
    const enhancedCanvas = addQuietZone(
      canvas,
      "grayscale(1) contrast(180%)",
    );

    const focusedFormats = retailFormats();
    const attempts = [
      [window.ZXing.GlobalHistogramBinarizer, false, focusedFormats],
      [window.ZXing.HybridBinarizer, false, focusedFormats],
      [window.ZXing.GlobalHistogramBinarizer, true, focusedFormats],
      [window.ZXing.GlobalHistogramBinarizer, false, null],
      [window.ZXing.HybridBinarizer, false, null],
    ];
    return decodeCanvasWithCore(
      [canvas, paddedCanvas, enhancedCanvas],
      attempts,
    );
  }

  // Add a white margin and optional filter to improve barcode decoding.
  function addQuietZone(sourceCanvas, filter = "none") {
    const padding = Math.max(16, Math.round(sourceCanvas.width * 0.08));
    const canvas = document.createElement("canvas");
    canvas.width = sourceCanvas.width + 2 * padding;
    canvas.height = sourceCanvas.height + 2 * padding;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("The image margin could not be prepared.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = filter;
    context.drawImage(sourceCanvas, padding, padding);
    return canvas;
  }

  // Normalize decoded or manually entered barcode text.
  function cleanBarcode(value) {
    return String(value || "").trim();
  }

  // Convert a ZXing barcode format into a readable label.
  function resultFormat(result) {
    const rawFormat = result.getBarcodeFormat?.();
    const formatName = window.ZXing?.BarcodeFormat?.[rawFormat];
    return String(formatName || rawFormat || "")
      .replaceAll("_", " ")
      .toLowerCase();
  }

  // Fetch existing product details for a barcode from the API.
  function requestProductLookup(barcode) {
    // Parse the API response and convert unsuccessful responses into errors.
    return fetch(`/api/products/${encodeURIComponent(barcode)}`, {
      headers: { Accept: "application/json" },
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Product lookup failed.");
      return data;
    });
  }

  // Validate and register a newly captured barcode for lookup.
  function addCapture(rawBarcode, source = "manual", format = "") {
    const barcode = cleanBarcode(rawBarcode);
    if (!barcode) {
      setScannerMessage("Enter a barcode first.", "error");
      return false;
    }
    if (barcode.length > config.maxBarcodeLength) {
      setScannerMessage(
        `That code is longer than the ${config.maxBarcodeLength}-character database limit.`,
        "error",
      );
      return false;
    }
    if (captures.has(barcode)) {
      return false;
    }

    const lookup = requestProductLookup(barcode);
    captures.set(barcode, { barcode, source, format, lookup, data: null });
    // Prevent a lookup rejection from becoming unhandled before the form awaits it.
    lookup.catch(() => {});

    navigator.vibrate?.(80);
    elements.manual_barcode.value = "";
    setScannerMessage(`${source === "camera" ? "Scanned" : "Added"} ${barcode}. Loading details…`, "success");
    return true;
  }

  // Create a blank capture for a product that has no barcode.
  function addUnbarcodedProduct() {
    const key = `unbarcoded-${crypto.randomUUID()}`;
    captures.set(key, {
      barcode: key,
      source: "manual",
      format: "",
      noBarcode: true,
      lookup: Promise.resolve({
        found: false,
        barcode: "",
        product: null,
      }),
      data: null,
    });
    showDetailsView();
  }

  // Open the details view shortly after a successful live scan.
  function queueAutomaticReview() {
    window.clearTimeout(autoReviewTimer);
    autoReviewTimer = window.setTimeout(showDetailsView, AUTO_REVIEW_DELAY_MS);
  }

  // Determine whether any captured product still has unsaved work.
  function hasUnsavedWork() {
    const forms = Array.from(
      elements.product_forms.querySelectorAll(".product-form-card"),
    );
    return (
      captures.size > forms.length ||
      // Treat any rendered form without a saved state as unsaved work.
      forms.some((form) => form.dataset.saved !== "true")
    );
  }

  // Ask for confirmation before discarding unsaved product data.
  function confirmDiscardUnsaved(message) {
    return !hasUnsavedWork() || window.confirm(message);
  }

  // Remove all captured products and their rendered forms.
  function clearCaptures() {
    captures.clear();
    elements.product_forms.replaceChildren();
    setScannerMessage("");
  }

  // Switch the interface back to the barcode capture view.
  function showScanView() {
    currentView = "scan";
    stopCamera();
    elements.scan_view.classList.remove("hidden");
    elements.details_view.classList.add("hidden");
    elements.capture_progress.classList.add("active");
    elements.details_progress.classList.remove("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Clear current work and begin a fresh scan workflow.
  function startNewScan(startCameraImmediately = false) {
    cancelPendingImageDecode();
    clearCaptures();
    showScanView();
    if (startCameraImmediately) startCamera();
  }

  // Switch to the details view and render forms for all captures.
  async function showDetailsView() {
    if (!captures.size) return;
    currentView = "details";
    stopCamera();
    elements.scan_view.classList.add("hidden");
    elements.details_view.classList.remove("hidden");
    elements.capture_progress.classList.remove("active");
    elements.details_progress.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });

    for (const capture of captures.values()) {
      if (!elements.product_forms.querySelector(`[data-barcode="${CSS.escape(capture.barcode)}"]`)) {
        renderProductForm(capture);
      }
    }
  }

  // Create and initialize a product form for one capture.
  function renderProductForm(capture) {
    const fragment = elements.product_form_template.content.cloneNode(true);
    const form = fragment.querySelector("form");
    form.dataset.barcode = capture.barcode;
    form.dataset.noBarcode = String(Boolean(capture.noBarcode));
    form.dataset.saved = "false";
    form.dataset.dirty = "false";
    form.querySelector(".form-number").textContent =
      String(elements.product_forms.children.length + 1).padStart(2, "0");
    form.querySelector(".product-barcode").textContent =
      capture.noBarcode ? "No barcode" : capture.barcode;
    form.querySelector(".product-barcode-format").textContent = capture.noBarcode
      ? "Unbarcoded item"
      : capture.format
        ? capture.format.toUpperCase()
        : capture.source === "manual"
          ? "Manual entry"
          : "Type unavailable";
    // Save this product when its form is submitted.
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveForm(form);
    });
    // Retry this capture's product lookup when requested.
    form.querySelector(".retry-lookup").addEventListener("click", () => {
      loadProductForm(form, capture, true);
    });
    elements.product_forms.append(form);
    loadProductForm(form, capture);
  }

  // Populate a product form from its lookup result or allow manual entry.
  async function loadProductForm(form, capture, retry = false) {
    const retryButton = form.querySelector(".retry-lookup");
    const loading = form.querySelector(".form-loading");
    const lookupToken = String(Number(form.dataset.lookupToken || 0) + 1);
    form.dataset.lookupToken = lookupToken;
    retryButton.classList.add("hidden");
    if (form.dataset.initialized !== "true") {
      loading.textContent = "Loading product details…";
      loading.className = "form-loading";
    } else {
      setFormMessage(form, "Retrying product lookup…");
    }
    if (retry) capture.lookup = requestProductLookup(capture.barcode);

    try {
      const data = await capture.lookup;
      if (!form.isConnected || form.dataset.lookupToken !== lookupToken) return;
      capture.data = data;
      const preserveEdits = retry && form.dataset.dirty === "true";
      populateProductForm(form, data, preserveEdits);
      if (preserveEdits) {
        setFormMessage(form, "Lookup succeeded; your edits were kept.", "success");
      } else {
        setFormMessage(form, "");
      }
    } catch (error) {
      if (!form.isConnected || form.dataset.lookupToken !== lookupToken) return;
      if (form.dataset.initialized !== "true") {
        populateProductForm(
          form,
          { found: false, barcode: capture.barcode, product: null },
          false,
        );
      }
      const status = form.querySelector(".record-status");
      status.className = "record-status error";
      status.textContent = "Lookup failed";
      retryButton.classList.remove("hidden");
      setFormMessage(
        form,
        `${error.message || "Product lookup failed."} Enter details manually or retry.`,
        "error",
      );
    }
  }

  // Mark a user-edited product form as having unsaved changes.
  function markFormDirty(form) {
    if (form.dataset.populating === "true") return;
    form.dataset.dirty = "true";
    form.dataset.saved = "false";
    const status = form.querySelector(".record-status");
    if (status.classList.contains("saved")) {
      status.className = "record-status new";
      status.textContent = "Unsaved changes";
    }
  }

  // Fill and activate a product form using lookup data.
  function populateProductForm(form, data, preserveEdits = false) {
    if (!form.isConnected) return;
    const fields = form.querySelector(".form-fields");
    form.querySelector(".form-loading").classList.add("hidden");
    fields.classList.remove("hidden");
    form.dataset.populating = "true";
    const status = form.querySelector(".record-status");
    status.className = `record-status ${data.found ? "found" : "new"}`;
    status.textContent = data.found ? "Product found" : "New product";

    const originalPrice = form.querySelector(".original-price");
    if (data.found) {
      if (!preserveEdits) {
        form.elements.name.value = data.product.name;
        form.elements.whole_price.value = "";
        form.elements.count.value = "1";
        form.elements.taxable.checked = false;
        form.elements.crv.checked = false;
      }
      originalPrice.classList.remove("hidden");
      originalPrice.querySelector('[data-role="original-price"]').textContent =
        `$${data.product.unit_price}`;
    } else if (!preserveEdits) {
      form.elements.name.value = "";
      form.elements.whole_price.value = "";
      form.elements.count.value = "1";
      form.elements.taxable.checked = false;
      form.elements.crv.checked = false;
      originalPrice.classList.add("hidden");
    }
    if (form.dataset.initialized !== "true") {
      // Track text and numeric input while recalculating dependent pricing.
      fields.addEventListener("input", (event) => {
        if (event.target.matches("input")) markFormDirty(form);
        if (event.target.matches('[name="whole_price"], [name="count"]')) {
          calculateUnitPrice(form);
        }
      });
      // Track toggle changes while recalculating tax and CRV pricing.
      fields.addEventListener("change", (event) => {
        if (event.target.matches("input")) markFormDirty(form);
        if (event.target.matches('[name="taxable"], [name="crv"]')) {
          calculateUnitPrice(form);
        }
      });
      form.dataset.initialized = "true";
    }
    form.dataset.populating = "false";
    calculateUnitPrice(form);
  }

  // Calculate the per-unit cost, then apply profit after tax and CRV.
  function calculateUnitPrice(form) {
    const price = Number.parseFloat(form.elements.whole_price.value);
    const count = Number.parseInt(form.elements.count.value, 10);
    const valid = Number.isFinite(price) && price >= 0 && Number.isInteger(count) && count > 0;
    const taxMultiplier = form.elements.taxable.checked
      ? 1 + config.salesTaxRate
      : 1;
    const crvPerUnit = form.elements.crv.checked
      ? config.crvCentsPerUnit / 100
      : 0;
    form.querySelector('[data-role="unit-price"]').textContent = valid
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
          ((price / count) * taxMultiplier + crvPerUnit) * (1 + config.profitRate),
        )
      : "—";
    const additions = [];
    if (form.elements.taxable.checked) {
      additions.push(
        `${new Intl.NumberFormat("en-US", {
          style: "percent",
          maximumFractionDigits: 3,
        }).format(config.salesTaxRate)} tax`,
      );
    }
    if (form.elements.crv.checked) {
      additions.push(
        `${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(config.crvCentsPerUnit / 100)} CRV`,
      );
    }
    additions.push(
      `${new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 3,
      }).format(config.profitRate)} profit`,
    );
    form.querySelector('[data-role="tax-note"]').textContent = additions.length
      ? `includes ${additions.join(" + ")}`
      : "no added costs";
  }

  // Validate and save one product form through the API.
  async function saveForm(form) {
    if (!form.reportValidity()) {
      form.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    const button = form.querySelector(".button-save");
    button.disabled = true;
    button.textContent = "Saving…";
    setFormMessage(form, "");
    try {
      const isUnbarcoded = form.dataset.noBarcode === "true";
      const unbarcodedPath = form.dataset.itemId
        ? `/api/unbarcoded-products/${form.dataset.itemId}`
        : "/api/unbarcoded-products";
      const response = await fetch(
        isUnbarcoded
          ? unbarcodedPath
          : `/api/products/${encodeURIComponent(form.dataset.barcode)}`,
        {
        method: isUnbarcoded && !form.dataset.itemId ? "POST" : "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: form.elements.name.value,
          whole_price: form.elements.whole_price.value,
          count: form.elements.count.value,
          taxable: form.elements.taxable.checked,
          crv: form.elements.crv.checked,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The product could not be saved.");
      if (isUnbarcoded) form.dataset.itemId = data.product.id;
      form.dataset.saved = "true";
      form.dataset.dirty = "false";
      const status = form.querySelector(".record-status");
      status.className = "record-status saved";
      status.textContent = "Saved";
      setFormMessage(
        form,
        `Saved. Unit price is $${data.product.unit_price}.`,
        "success",
      );
      return true;
    } catch (error) {
      setFormMessage(form, error.message, "error");
      return false;
    } finally {
      button.disabled = false;
      button.textContent = "Save product";
    }
  }

  // Confirm any data loss and return to a clean scan workflow.
  function startOver() {
    if (!confirmDiscardUnsaved("Discard all unsaved product forms and start over?")) return;
    startNewScan(false);
  }

  elements.camera_button.addEventListener("click", startCamera);
  elements.stop_button.addEventListener("click", stopCamera);
  // Decode the newly selected image file.
  elements.image_input.addEventListener("change", (event) => decodeImage(event.target.files[0]));
  elements.no_barcode_button.addEventListener("click", addUnbarcodedProduct);
  // Add a manually entered barcode and open its details form.
  elements.manual_form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (addCapture(elements.manual_barcode.value, "manual")) showDetailsView();
  });
  // Confirm unsaved changes before starting another live scan.
  elements.scan_more_button.addEventListener("click", () => {
    if (!confirmDiscardUnsaved("Discard unsaved product forms and scan another product?")) return;
    startNewScan(true);
  });
  elements.home_button.addEventListener("click", startOver);
  window.addEventListener("pagehide", stopCamera);
  // Warn before the page unloads while product work remains unsaved.
  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedWork()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  applyConfiguration();
})();
