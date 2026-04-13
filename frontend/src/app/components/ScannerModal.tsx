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
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasScannedRef = useRef(false);

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
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    if (readerRef.current) {
      try {
        readerRef.current.reset(); // Fully stop decoding process and device feeds
      } catch (e) {} finally {
        readerRef.current = null;
      }
    }
    hasScannedRef.current = true; // prevent accidental async resolves
    setIsScanning(false);
    setIsLoading(false);
  }, []);

  const startScanner = useCallback(async () => {
    try {
      hasScannedRef.current = false;
      setError(null);
      setIsLoading(true);

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_128,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      // Decreased timeout delay to 50ms for extremely fast continuous decoding
      const codeReader = new BrowserMultiFormatReader(hints, 50);
      readerRef.current = codeReader;

      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        throw new Error("Camera API not supported (HTTPS or localhost required)");
      }

      // Insist on the environment camera contextually
      const tempStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      tempStream.getTracks().forEach(track => track.stop());

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(device => device.kind === "videoinput");
      
      if (videoDevices.length === 0) {
         throw new Error("No camera devices found");
      }

      const backCamera =
        videoDevices.find(
          (d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("rear") ||
            d.label.toLowerCase().includes("environment")
        ) || videoDevices[videoDevices.length - 1];

      setIsLoading(false);
      setIsScanning(true);

      scanTimeoutRef.current = setTimeout(() => {
        if (!hasScannedRef.current) {
          stopScanner();
          setError("Scan timeout. Try again");
        }
      }, 10000); // 10-second scanner lock limit 

      await codeReader.decodeFromVideoDevice(
        backCamera.deviceId,
        videoRef.current!,
        (result, err) => {
          if (hasScannedRef.current) return; 

          if (result) {
            hasScannedRef.current = true;
            playBeep();
            if (navigator.vibrate) navigator.vibrate(150);
            
            // Output parsing & immediately cease feed
            stopScanner();
            onScan(result.getText());
            onClose();
          }

          if (err && !(err instanceof NotFoundException)) {
            console.warn("Scan warning:", err.message);
          }
        }
      );
    } catch (err: any) {
      setIsLoading(false);
      setIsScanning(false);
      if (err.name === "NotAllowedError" || err.message?.includes("Permission denied")) {
        setError("Camera permission denied. Please allow access in your browser settings.");
      } else if (err.name === "NotFoundError" || err.message?.includes("No camera")) {
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
      const t = setTimeout(startScanner, 200);
      return () => {
        clearTimeout(t);
        stopScanner();
      };
    }
  }, [isOpen, startScanner, stopScanner]);

  const handleRetry = () => {
    stopScanner();
    setTimeout(startScanner, 200);
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={() => {
          stopScanner();
          onClose();
        }}
      />

      <div className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl max-h-[70vh] flex flex-col shadow-[0_-15px_60px_-15px_rgba(0,0,0,0.3)]">
        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-4 mb-2" />

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 rounded-xl">
              <Camera size={18} className="text-blue-600" />
            </div>
            <span className="font-bold text-gray-800 text-sm tracking-wide">
              Scan Barcode / QR
            </span>
          </div>
          <button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <X size={16} className="text-gray-600" />
          </button>
        </div>

        <div
          className="relative mx-5 rounded-2xl overflow-hidden bg-black mt-4 shadow-inner"
          style={{ height: "260px" }}
        >
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted
            playsInline
          />
          {isScanning && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
              <div className="relative w-56 h-36">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />
                <div className="absolute left-0 right-0 h-0.5 bg-emerald-400 animate-scan-line shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]" />
              </div>
            </div>
          )}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
              <span className="text-white text-sm font-medium tracking-wide">Connecting Camera...</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 px-6 backdrop-blur-md">
              <div className="text-red-400 text-3xl mb-3">⚠️</div>
              <p className="text-white text-sm text-center mb-4 font-medium leading-relaxed">{error}</p>
              <button
                onClick={handleRetry}
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg"
              >
                Retry Scanner
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs font-medium text-gray-500 mt-4 mb-2 px-6">
          Align any QR or Barcode inside the frame to add dynamically
        </p>

        <div className="px-5 pb-8 pt-2">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Or type barcode manually & hit enter..."
            className="w-full px-4 py-3.5 text-sm font-medium border-2 border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all shadow-sm"
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
