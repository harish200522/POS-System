const SCRIPT_URLS = {
  zxing: "https://unpkg.com/@zxing/browser@0.1.5/umd/zxing-browser.min.js",
  quagga: "https://unpkg.com/quagga@0.12.1/dist/quagga.min.js",
};

const scriptLoaderCache = new Map();

const DEFAULT_OPTIONS = {
  noDetectionTimeoutMs: 12000,
  successCooldownMs: 1300,
  confirmationHits: 2,
  confirmationWindowMs: 1800,
  minAcceptedLength: 4,
  autoStopOnSuccess: true,
  debug: false,
};

function loadExternalScript(url, globalName) {
  if (globalName && window[globalName]) {
    return Promise.resolve(window[globalName]);
  }

  const cachedPromise = scriptLoaderCache.get(url);
  if (cachedPromise) {
    return cachedPromise;
  }

  const promise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[data-external-src="${url}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(globalName ? window[globalName] : true), {
        once: true,
      });
      existingScript.addEventListener("error", () => reject(new Error(`Unable to load script: ${url}`)), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.defer = true;
    script.dataset.externalSrc = url;

    script.addEventListener(
      "load",
      () => {
        resolve(globalName ? window[globalName] : true);
      },
      { once: true }
    );

    script.addEventListener(
      "error",
      () => {
        scriptLoaderCache.delete(url);
        reject(new Error(`Unable to load script: ${url}`));
      },
      { once: true }
    );

    document.head.appendChild(script);
  });

  scriptLoaderCache.set(url, promise);
  return promise;
}

function normalizeBarcode(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function isLikelyRearCameraLabel(label) {
  return /rear|back|environment|world|camera\s*2|camera\s*3/i.test(String(label || ""));
}

async function resolvePreferredRearCameraId() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return "";
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === "videoinput");
  if (!cameras.length) {
    return "";
  }

  const explicitRear = cameras.find((device) => isLikelyRearCameraLabel(device.label));
  if (explicitRear?.deviceId) {
    return explicitRear.deviceId;
  }

  return cameras[cameras.length - 1]?.deviceId || "";
}

function getUserFacingCameraError(error) {
  const errorName = String(error?.name || "");

  if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
    return "Camera access denied";
  }

  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
    return "No camera detected";
  }

  if (errorName === "NotReadableError" || errorName === "TrackStartError") {
    return "Camera is busy in another app";
  }

  if (errorName === "SecurityError") {
    return "Camera requires secure context (HTTPS)";
  }

  return "Unable to start camera scanner";
}

function shouldIgnoreDecodeError(error) {
  const message = String(error?.message || error || "").toLowerCase();

  return (
    message.includes("notfoundexception") ||
    message.includes("not found") ||
    message.includes("checksum") ||
    message.includes("formatexception") ||
    message.includes("decode")
  );
}

function safeFormatValue(result) {
  if (!result) {
    return "";
  }

  if (typeof result.getBarcodeFormat === "function") {
    return String(result.getBarcodeFormat());
  }

  if (result.barcodeFormat) {
    return String(result.barcodeFormat);
  }

  return "";
}

function safeTextValue(result) {
  if (!result) {
    return "";
  }

  if (typeof result.getText === "function") {
    return String(result.getText() || "");
  }

  if (typeof result.text === "string") {
    return result.text;
  }

  return "";
}

function clearElementChildren(element) {
  if (!element) {
    return;
  }

  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function getTrackCapabilities(track) {
  if (!track || typeof track.getCapabilities !== "function") {
    return {};
  }

  try {
    return track.getCapabilities() || {};
  } catch (error) {
    return {};
  }
}

function getTrackFromContainer(containerElement) {
  if (!containerElement) {
    return null;
  }

  const videoElement = containerElement.querySelector("video");
  if (!(videoElement instanceof HTMLVideoElement)) {
    return null;
  }

  const stream = videoElement.srcObject;
  if (!(stream instanceof MediaStream)) {
    return null;
  }

  return stream.getVideoTracks()[0] || null;
}

function delayNextFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

class ProductionBarcodeScanner {
  constructor(options = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    this.stageElement = options.stageElement || null;
    this.viewportElement = options.viewportElement || null;
    this.statusElement = options.statusElement || null;
    this.loadingElement = options.loadingElement || null;
    this.startButton = options.startButton || null;
    this.stopButton = options.stopButton || null;
    this.torchButton = options.torchButton || null;

    this.running = false;
    this.engine = "";
    this.noDetectionTimeoutId = null;
    this.lastAcceptedCode = "";
    this.lastAcceptedAt = 0;
    this.candidateCode = "";
    this.candidateHits = 0;
    this.candidateSeenAt = 0;
    this.detectionInFlight = false;

    this.quaggaHandler = null;
    this.zxingReader = null;
    this.zxingControls = null;

    this.activeVideoTrack = null;
    this.torchAvailable = false;
    this.torchEnabled = false;

    this.setStatus("Tap Start Scan to begin", "info");
    this.updateControlState();
  }

  isRunning() {
    return this.running;
  }

  async start() {
    if (this.running) {
      this.setStatus("Scanner already running", "info");
      return true;
    }

    if (!this.viewportElement) {
      this.emitError("Scanner viewport is missing");
      return false;
    }

    if (!window.isSecureContext) {
      this.emitError("Camera requires secure context (HTTPS)");
      return false;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.emitError("Camera API not supported on this device");
      return false;
    }

    this.running = true;
    this.resetCandidateState();
    this.setLoading(true, "Starting camera...");
    this.setStatus("Initializing scanner...", "info");
    this.updateControlState();
    this.setStageActive(true);

    let preferredCameraId = "";

    try {
      const preflightStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      preflightStream.getTracks().forEach((track) => track.stop());
      preferredCameraId = await resolvePreferredRearCameraId();
    } catch (error) {
      await this.stop();
      this.emitError(getUserFacingCameraError(error));
      return false;
    }

    try {
      await this.startWithZxing(preferredCameraId);
      this.engine = "zxing";
      this.debug("ZXing scanner started");
    } catch (zxingError) {
      this.debug("ZXing failed, switching to Quagga fallback", {
        message: zxingError?.message || String(zxingError),
      });

      try {
        await this.startWithQuagga(preferredCameraId);
        this.engine = "quagga";
        this.setStatus("Scanner running in fallback mode (barcode only)", "warning");
      } catch (quaggaError) {
        await this.stop();
        this.emitError(getUserFacingCameraError(quaggaError));
        return false;
      }
    }

    await this.configureCameraTrack();
    this.startNoDetectionTimer();
    this.setLoading(false);

    if (this.engine === "zxing") {
      this.setStatus("Align barcode or QR within the box and hold steady", "info");
    }

    this.updateControlState();
    return true;
  }

  async stop() {
    this.clearNoDetectionTimer();

    try {
      if (this.engine === "zxing") {
        if (this.zxingControls && typeof this.zxingControls.stop === "function") {
          this.zxingControls.stop();
        }

        if (this.zxingReader && typeof this.zxingReader.reset === "function") {
          this.zxingReader.reset();
        }
      }

      if (this.engine === "quagga") {
        const Quagga = window.Quagga;

        if (Quagga && this.quaggaHandler) {
          Quagga.offDetected(this.quaggaHandler);
          this.quaggaHandler = null;
        }

        if (Quagga && typeof Quagga.stop === "function") {
          Quagga.stop();
        }
      }
    } catch (error) {
      this.debug("Scanner stop encountered a recoverable error", {
        message: error?.message || String(error),
      });
    }

    if (this.activeVideoTrack && this.activeVideoTrack.readyState === "live") {
      try {
        this.activeVideoTrack.stop();
      } catch (error) {
        this.debug("Video track stop warning", {
          message: error?.message || String(error),
        });
      }
    }

    const trackFromContainer = getTrackFromContainer(this.viewportElement);
    if (trackFromContainer && trackFromContainer.readyState === "live") {
      try {
        trackFromContainer.stop();
      } catch (error) {
        this.debug("Container track stop warning", {
          message: error?.message || String(error),
        });
      }
    }

    this.running = false;
    this.engine = "";
    this.zxingReader = null;
    this.zxingControls = null;
    this.activeVideoTrack = null;
    this.torchAvailable = false;
    this.torchEnabled = false;
    this.detectionInFlight = false;
    this.resetCandidateState();

    this.setStatus("Scanner stopped. Tap Start Scan to resume", "info");
    this.setLoading(false);
    this.setStageActive(false);
    this.updateControlState();

    if (this.viewportElement) {
      clearElementChildren(this.viewportElement);
    }
  }

  async toggleTorch() {
    if (!this.running || !this.torchAvailable) {
      return false;
    }

    const shouldEnable = !this.torchEnabled;

    try {
      if (this.zxingControls && typeof this.zxingControls.switchTorch === "function") {
        await this.zxingControls.switchTorch(shouldEnable);
      } else if (this.activeVideoTrack) {
        await this.activeVideoTrack.applyConstraints({
          advanced: [{ torch: shouldEnable }],
        });
      }

      this.torchEnabled = shouldEnable;
      this.setStatus(this.torchEnabled ? "Torch enabled" : "Torch disabled", "info");
      this.updateControlState();
      return true;
    } catch (error) {
      this.debug("Torch toggle failed", {
        message: error?.message || String(error),
      });
      this.emitError("Torch control unavailable on this camera");
      this.torchEnabled = false;
      this.updateControlState();
      return false;
    }
  }

  async startWithZxing(preferredCameraId) {
    const ZXingBrowser = await loadExternalScript(SCRIPT_URLS.zxing, "ZXingBrowser");
    if (!ZXingBrowser || !ZXingBrowser.BrowserMultiFormatReader) {
      throw new Error("ZXing engine unavailable");
    }

    this.prepareViewportForVideo();

    const hints = new Map();
    if (window.ZXing?.DecodeHintType && window.ZXing?.BarcodeFormat) {
      hints.set(window.ZXing.DecodeHintType.TRY_HARDER, true);
      hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        window.ZXing.BarcodeFormat.EAN_13,
        window.ZXing.BarcodeFormat.UPC_A,
        window.ZXing.BarcodeFormat.CODE_128,
        window.ZXing.BarcodeFormat.EAN_8,
        window.ZXing.BarcodeFormat.QR_CODE,
      ]);
    }

    this.zxingReader = new ZXingBrowser.BrowserMultiFormatReader(hints, 70);

    const constraints = this.buildVideoConstraints(preferredCameraId);

    this.zxingControls = await this.zxingReader.decodeFromConstraints(
      constraints,
      this.viewportElement.querySelector("video"),
      (result, error) => {
        if (result) {
          void this.handleDetection({
            rawValue: safeTextValue(result),
            format: safeFormatValue(result),
            engine: "zxing",
          });
          return;
        }

        if (error && !shouldIgnoreDecodeError(error)) {
          this.debug("ZXing decode warning", {
            message: error?.message || String(error),
          });
        }
      }
    );
  }

  async startWithQuagga(preferredCameraId) {
    const Quagga = await loadExternalScript(SCRIPT_URLS.quagga, "Quagga");
    if (!Quagga) {
      throw new Error("Quagga engine unavailable");
    }

    if (this.viewportElement) {
      clearElementChildren(this.viewportElement);
    }

    const constraints = this.buildVideoConstraints(preferredCameraId).video;

    await new Promise((resolve, reject) => {
      Quagga.init(
        {
          numOfWorkers: Math.min(navigator.hardwareConcurrency || 2, 4),
          frequency: 18,
          locator: {
            patchSize: "large",
            halfSample: false,
          },
          inputStream: {
            type: "LiveStream",
            target: this.viewportElement,
            constraints,
          },
          decoder: {
            multiple: false,
            readers: [
              "ean_reader",
              "ean_8_reader",
              "upc_reader",
              "upc_e_reader",
              "code_128_reader",
              "code_39_reader",
            ],
          },
          locate: true,
        },
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        }
      );
    });

    this.quaggaHandler = (result) => {
      void this.handleDetection({
        rawValue: String(result?.codeResult?.code || ""),
        format: String(result?.codeResult?.format || ""),
        engine: "quagga",
      });
    };

    Quagga.onDetected(this.quaggaHandler);
    Quagga.start();
  }

  buildVideoConstraints(preferredCameraId = "") {
    const constraints = {
      audio: false,
      video: {
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    };

    if (preferredCameraId) {
      constraints.video.deviceId = { exact: preferredCameraId };
    } else {
      constraints.video.facingMode = { ideal: "environment" };
    }

    return constraints;
  }

  prepareViewportForVideo() {
    if (!this.viewportElement) {
      return;
    }

    clearElementChildren(this.viewportElement);

    const videoElement = document.createElement("video");
    videoElement.setAttribute("playsinline", "true");
    videoElement.setAttribute("autoplay", "true");
    videoElement.setAttribute("muted", "true");
    videoElement.className = "scanner-video";

    this.viewportElement.appendChild(videoElement);
  }

  async configureCameraTrack() {
    this.activeVideoTrack = null;

    for (let attempt = 0; attempt < 45; attempt += 1) {
      const track = getTrackFromContainer(this.viewportElement);
      if (track) {
        this.activeVideoTrack = track;
        break;
      }

      await delayNextFrame();
    }

    if (!this.activeVideoTrack) {
      this.torchAvailable = false;
      this.updateControlState();
      return;
    }

    await this.applyContinuousAutoFocus();

    const capabilities = getTrackCapabilities(this.activeVideoTrack);
    this.torchAvailable = Boolean(capabilities?.torch);
    this.updateControlState();
  }

  async applyContinuousAutoFocus() {
    if (!this.activeVideoTrack || typeof this.activeVideoTrack.applyConstraints !== "function") {
      return;
    }

    const capabilities = getTrackCapabilities(this.activeVideoTrack);
    const focusModes = Array.isArray(capabilities.focusMode) ? capabilities.focusMode : [];

    if (!focusModes.includes("continuous")) {
      return;
    }

    try {
      await this.activeVideoTrack.applyConstraints({
        advanced: [{ focusMode: "continuous" }],
      });
    } catch (error) {
      this.debug("Continuous autofocus unavailable", {
        message: error?.message || String(error),
      });
    }
  }

  async handleDetection({ rawValue, format, engine }) {
    if (!this.running) {
      return;
    }

    const normalizedCode = normalizeBarcode(rawValue);
    if (!normalizedCode || normalizedCode.length < this.options.minAcceptedLength) {
      return;
    }

    const now = Date.now();
    const withinConfirmationWindow =
      now - this.candidateSeenAt <= this.options.confirmationWindowMs;

    if (normalizedCode === this.candidateCode && withinConfirmationWindow) {
      this.candidateHits += 1;
    } else {
      this.candidateCode = normalizedCode;
      this.candidateHits = 1;
    }

    this.candidateSeenAt = now;
    this.startNoDetectionTimer();

    this.debug("Scanner candidate", {
      normalizedCode,
      hits: this.candidateHits,
      required: this.options.confirmationHits,
      engine,
      format,
    });

    if (this.candidateHits < this.options.confirmationHits) {
      this.setStatus("Reading code... hold steady", "info");
      return;
    }

    const isDuplicate =
      normalizedCode === this.lastAcceptedCode &&
      now - this.lastAcceptedAt < this.options.successCooldownMs;

    if (this.detectionInFlight || isDuplicate) {
      return;
    }

    this.detectionInFlight = true;
    this.lastAcceptedCode = normalizedCode;
    this.lastAcceptedAt = now;
    this.resetCandidateState();
    this.flashSuccess();

    try {
      if (this.options.autoStopOnSuccess) {
        await this.stop();
      }

      if (typeof this.options.onDetected === "function") {
        await this.options.onDetected({
          code: normalizedCode,
          rawValue: String(rawValue || ""),
          format,
          engine,
        });
      }
    } finally {
      this.detectionInFlight = false;
    }
  }

  async handleNoDetectionTimeout() {
    if (!this.running) {
      return;
    }

    await this.stop();
    this.setStatus("No barcode or QR detected. Try better lighting or hold steady", "warning");

    if (typeof this.options.onNoDetection === "function") {
      this.options.onNoDetection();
    }
  }

  startNoDetectionTimer() {
    this.clearNoDetectionTimer();

    this.noDetectionTimeoutId = window.setTimeout(() => {
      void this.handleNoDetectionTimeout();
    }, this.options.noDetectionTimeoutMs);
  }

  clearNoDetectionTimer() {
    if (this.noDetectionTimeoutId) {
      window.clearTimeout(this.noDetectionTimeoutId);
      this.noDetectionTimeoutId = null;
    }
  }

  resetCandidateState() {
    this.candidateCode = "";
    this.candidateHits = 0;
    this.candidateSeenAt = 0;
  }

  setStatus(message, tone = "info") {
    if (this.statusElement) {
      this.statusElement.textContent = message;
      this.statusElement.dataset.tone = tone;
    }

    if (typeof this.options.onStatus === "function") {
      this.options.onStatus(message, tone);
    }
  }

  setLoading(isLoading, label = "") {
    if (!this.loadingElement) {
      return;
    }

    this.loadingElement.classList.toggle("hidden", !isLoading);

    if (label) {
      this.loadingElement.textContent = label;
    }
  }

  setStageActive(isActive) {
    if (!this.stageElement) {
      return;
    }

    this.stageElement.classList.toggle("scanner-stage-active", Boolean(isActive));
  }

  flashSuccess() {
    if (!this.stageElement) {
      return;
    }

    this.stageElement.classList.add("scanner-stage-success");
    window.setTimeout(() => {
      this.stageElement.classList.remove("scanner-stage-success");
    }, 520);
  }

  updateControlState() {
    if (this.startButton) {
      this.startButton.disabled = this.running;
    }

    if (this.stopButton) {
      this.stopButton.disabled = !this.running;
    }

    if (this.torchButton) {
      this.torchButton.disabled = !this.running || !this.torchAvailable;
      this.torchButton.textContent = this.torchAvailable
        ? this.torchEnabled
          ? "Torch On"
          : "Torch Off"
        : "Torch N/A";
    }
  }

  emitError(message) {
    const safeMessage = String(message || "Unable to start camera scanner").trim();

    this.setStatus(safeMessage, "error");

    if (typeof this.options.onError === "function") {
      this.options.onError(safeMessage);
    }
  }

  debug(message, payload = null) {
    if (!this.options.debug) {
      return;
    }

    if (payload) {
      console.info(`[scanner-service] ${message}`, payload);
      return;
    }

    console.info(`[scanner-service] ${message}`);
  }
}

export function createBarcodeScanner(options = {}) {
  return new ProductionBarcodeScanner(options);
}
