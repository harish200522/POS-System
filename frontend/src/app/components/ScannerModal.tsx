import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Camera, AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
}

export default function ScannerModal({ isOpen, onClose, onScan }: ScannerModalProps) {
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        // Ignore stop errors
      } finally {
        scannerRef.current?.clear();
        scannerRef.current = null;
      }
    }
  }, []);

  const startScanner = useCallback(async () => {
    try {
      setError("");
      setIsLoading(true);

      // 1. Check for secure context
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      if (!window.isSecureContext && !isLocalhost) {
        throw new Error("Scanner requires a secure context (HTTPS) to access the camera.");
      }

      // 2. Check for browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera API is not supported in this browser. Please update or try a different browser.");
      }

      // 3. Pre-request permissions to get explicit error types (NotAllowedError, etc)
      try {
        // Request the environment camera explicitly
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: { ideal: "environment" } } 
        });
        // Important: Stop the stream immedately, we just wanted permission
        stream.getTracks().forEach(track => track.stop());
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          throw new Error("Camera access denied. Please grant permissions in your browser settings and try again.");
        } else if (err.name === 'NotFoundError') {
          throw new Error("No usable camera found on this device.");
        } else if (err.name === 'NotReadableError') {
          throw new Error("Camera is already in use by another application. Please close it and try again.");
        } else {
          throw new Error(err.message || "Failed to access camera hardware.");
        }
      }

      // Clear any previous instance
      await stopScanner();

      // Ensure the element is present in the DOM
      const readerElement = document.getElementById("reader");
      if (!readerElement) {
        throw new Error("Scanner container not found in DOM.");
      }

      // 4. Initialize Scanner
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          // Success handler
          stopScanner().then(() => {
            onScan(decodedText);
          }).catch(() => {
            // Fallback call if stop fails
            onScan(decodedText);
          });
        },
        (errorMessage) => {
          // Ignore read misses/errors during scanning (these happen constantly as it looks for codes)
        }
      );
      
      setIsLoading(false);
    } catch (err: any) {
      setIsLoading(false);
      setError(err?.message || "Failed to start camera. Please check permissions.");
    }
  }, [onScan, stopScanner]);

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    // Small delay to ensure the DOM id="reader" is fully painted
    const timer = setTimeout(() => {
      startScanner();
    }, 150);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [isOpen, startScanner, stopScanner]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          ></motion.div>

          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 25 }}
            className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md bg-white rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                  <Camera className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-stone-800">Scan Barcode / QR</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors"
                disabled={isLoading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-6 relative bg-stone-50 min-h-[350px] flex items-center justify-center flex-col">
              {error ? (
                <div className="text-center p-4">
                  <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-stone-800 mb-1">Camera Error</p>
                  <p className="text-sm text-stone-600 mb-6">{error}</p>
                  <button 
                    onClick={startScanner}
                    className="flex items-center gap-2 mx-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Retry Camera
                  </button>
                </div>
              ) : (
                <div className="w-full relative shadow-inner rounded-xl overflow-hidden border-2 border-stone-300 bg-black min-h-[250px] flex items-center justify-center">
                  {/* Container must stay in DOM for Html5Qrcode to bind to it */}
                  <div id="reader" className="w-full absolute inset-0 text-white" />
                  
                  {isLoading && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
                      <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
                      <p className="text-sm text-white font-medium">Initializing camera...</p>
                    </div>
                  )}
                </div>
              )}
              
              {!error && (
                <div className="mt-4 text-center">
                  <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
                    Align code within the frame
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
