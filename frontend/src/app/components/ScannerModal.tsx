import React, { useEffect, useRef, useState, useCallback } from "react";
import { X, Camera, ScanLine } from "lucide-react";
import {
  BrowserMultiFormatReader,
  NotFoundException,
  BarcodeFormat,
  DecodeHintType,
} from "@zxing/library";

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
}

export default function ScannerModal({
  isOpen,
  onClose,
  onScan,
}: ScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playBeep = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1200;
      osc.type = "square";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {}
  };

  const stopScanner = useCallback(() => {
    if (readerRef.current) {
      try {
        readerRef.current.reset();
      } catch (e) {} finally {
        readerRef.current = null;
      }
    }
    setIsScanning(false);
    setIsLoading(false);
  }, []);

  const startScanner = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.ITF,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const codeReader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 80,
        delayBetweenScanSuccess: 1500,
      });
      readerRef.current = codeReader;

      // Use native Web API instead of ZXing's static method to prevent minification issues
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        throw new Error("Camera API not supported (HTTPS or localhost required)");
      }

      // Briefly request camera to ensure we get permission and accurate device labels
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      tempStream.getTracks().forEach(track => track.stop());

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(device => device.kind === "videoinput");
      
      if (videoDevices.length === 0) {
         throw new Error("No camera devices found");
      }

      // Always prefer back/rear camera on mobile
      const backCamera =
        videoDevices.find(
          (d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("rear") ||
            d.label.toLowerCase().includes("environment")
        ) || videoDevices[videoDevices.length - 1];

      setIsLoading(false);
      setIsScanning(true);

      await codeReader.decodeFromVideoDevice(
        backCamera.deviceId,
        videoRef.current!,
        (result, err) => {
          if (result) {
            playBeep();
            if (navigator.vibrate) navigator.vibrate(150);
            onScan(result.getText());
            stopScanner();
            onClose();
          }
          if (err && !(err instanceof NotFoundException)) {
            console.warn("scan attempt:", err.message);
          }
        }
      );
    } catch (err: any) {
      setIsLoading(false);
      setIsScanning(false);
      if (err.name === "NotAllowedError" || err.message.includes("Permission denied")) {
        setError("Camera permission denied. Please allow access in your browser settings.");
      } else if (err.name === "NotFoundError" || err.message.includes("No camera")) {
        setError("No camera found on this device.");
      } else if (err.name === "NotReadableError") {
        setError("Camera is already in use by another application.");
      } else {
        setError(err.message || "Camera access failed or device unsupported.");
      }
    }
  }, [onClose, onScan, stopScanner]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(startScanner, 350);
      return () => {
        clearTimeout(t);
        stopScanner();
      };
    }
  }, [isOpen, startScanner, stopScanner]);

  const handleRetry = () => {
    stopScanner();
    setTimeout(startScanner, 300);
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/60"
        onClick={() => {
          stopScanner();
          onClose();
        }}
      />

      <div className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-2xl max-h-[62vh] flex flex-col shadow-2xl">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-1" />

        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-blue-600" />
            <span className="font-semibold text-gray-800 text-sm">
              Scan Barcode / QR
            </span>
          </div>
          <button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="p-1 rounded-full hover:bg-gray-100"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div
          className="relative mx-4 rounded-xl overflow-hidden bg-black"
          style={{ height: "240px" }}
        >
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted
            playsInline
          />
          {isScanning && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-48 h-32">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-green-400 rounded-tl" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-green-400 rounded-tr" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-green-400 rounded-bl" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-green-400 rounded-br" />
                <div className="absolute left-0 right-0 h-0.5 bg-green-400 animate-scan-line" />
              </div>
            </div>
          )}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mb-2" />
              <span className="text-white text-xs">Starting camera...</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 px-4">
              <div className="text-red-400 text-2xl mb-2">⚠️</div>
              <p className="text-white text-xs text-center mb-3">{error}</p>
              <button
                onClick={handleRetry}
                className="bg-blue-600 text-white text-xs px-4 py-2 rounded-lg"
              >
                Retry Camera
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-500 mt-2 mb-1">
          Point camera at any barcode or QR code
        </p>

        <div className="px-4 pb-6 pt-1">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Or type barcode manually..."
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.value.trim()) {
                onScan(e.currentTarget.value.trim());
                stopScanner();
                onClose();
              }
            }}
          />
        </div>
      </div>
    </>
  );
}
