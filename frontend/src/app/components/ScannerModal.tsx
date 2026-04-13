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
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // STEP 4 - Clean Stop Scanner
  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        // State 2 = SCANNING, State 1 = PAUSED
        if (state === 2 || state === 1) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.warn("Scanner stop error:", err);
      } finally {
        scannerRef.current = null;
      }
    }
  }, []);

  // STEP 7 - Specific Error Messages
  const getErrorMessage = (errorName: string): string => {
    switch (errorName) {
      case 'NotAllowedError':
        return 'Camera blocked. Tap the camera icon in your browser address bar and select "Allow", then tap Retry.';
      case 'NotFoundError':
        return 'No camera detected on this device.';
      case 'NotReadableError':
        return 'Camera is busy. Close other apps using the camera and tap Retry.';
      case 'OverconstrainedError':
        return 'Camera configuration failed. Tap Retry to use default camera.';
      default:
        return 'Camera error. Please tap Retry or refresh the page.';
    }
  };

  // STEP 5 - Add permission check
  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (navigator.permissions) {
        const permission = await navigator.permissions.query({
          name: 'camera' as PermissionName
        });
        if (permission.state === 'denied') {
          setError('Camera permission is permanently denied. Please go to browser Settings → Site Settings → Camera and allow access, then refresh the page.');
          return false;
        }
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err: any) {
      if (err.name) {
         setError(getErrorMessage(err.name));
      } else {
         setError(`Camera error: ${err.message}`);
      }
      return false;
    }
  }, []);

  const startScanner = useCallback(async () => {
    try {
      setError(null);
      setIsStarting(true);

      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        setIsStarting(false);
        return;
      }

      await stopScanner();

      const readerElement = document.getElementById("reader");
      if (!readerElement) {
        throw new Error("Scanner container not found in DOM.");
      }

      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        showTorchButtonIfSupported: true,
        showZoomSliderIfSupported: true,
        defaultZoomValueIfSupported: 1,
      };

      // STEP 3 - 3-level fallback
      try {
        await html5QrCode.start(
          { facingMode: { exact: "environment" } },
          config,
          (decodedText) => {
             stopScanner().then(() => onScan(decodedText)).catch(() => onScan(decodedText));
          },
          () => {} // Ignore read hits
        );
      } catch (err) {
        try {
          await html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
               stopScanner().then(() => onScan(decodedText)).catch(() => onScan(decodedText));
            },
            () => {}
          );
        } catch (fallbackErr) {
          try {
            await html5QrCode.start(
              { facingMode: "user" },
              config,
              (decodedText) => {
                 stopScanner().then(() => onScan(decodedText)).catch(() => onScan(decodedText));
             },
             () => {}
            );
          } catch (finalErr) {
            setError("Camera access denied. Please grant permissions and try again.");
          }
        }
      }

      setIsStarting(false);
    } catch (err: any) {
      setIsStarting(false);
      setError(err?.message || "Failed to start camera.");
    }
  }, [onScan, requestCameraPermission, stopScanner]);

  // STEP 2 - Delay start on modal open
  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    const timer = setTimeout(() => {
      startScanner();
    }, 300);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [isOpen, startScanner, stopScanner]);

  // STEP 6 - Handle retry
  const handleRetry = async () => {
    setError(null);
    setIsStarting(true);
    await stopScanner();
    setTimeout(() => {
      startScanner();
    }, 500);
  };

  const handleClose = async () => {
    await stopScanner();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             onClick={handleClose}
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
                onClick={handleClose}
                className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors"
                disabled={isStarting}
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
                    onClick={handleRetry}
                    className="flex items-center gap-2 mx-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Retry Camera
                  </button>
                </div>
              ) : (
                <div className="w-full relative shadow-inner rounded-xl overflow-hidden border-2 border-stone-300 bg-black min-h-[250px] flex items-center justify-center">
                  <div id="reader" className="w-full absolute inset-0 text-white" />
                  
                  {isStarting && (
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
