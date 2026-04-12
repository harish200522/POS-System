import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Camera, AlertCircle } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
}

export default function ScannerModal({ isOpen, onClose, onScan }: ScannerModalProps) {
  const [error, setError] = useState<string>("");
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).finally(() => {
          scannerRef.current?.clear();
          scannerRef.current = null;
        });
      }
      return;
    }

    const startScanner = async () => {
      try {
        setError("");
        const html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;
        
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
          },
          (decodedText) => {
            // Success handler
            // Stop scanning and call handler
            html5QrCode.stop().then(() => {
              html5QrCode.clear();
              scannerRef.current = null;
              onScan(decodedText);
            }).catch(() => {
               // Fallback call
               onScan(decodedText);
            });
          },
          (errorMessage) => {
            // Only care about actual fatal errors, not read misses
          }
        );
      } catch (err: any) {
        setError(err?.message || "Failed to start camera. Please check permissions.");
      }
    };

    // Small delay to ensure the DOM id="reader" is fully painted
    const timer = setTimeout(() => {
      startScanner();
    }, 100);

    return () => {
      clearTimeout(timer);
      if (scannerRef.current) {
         scannerRef.current.stop().catch(() => {}).finally(() => {
            scannerRef.current?.clear();
            scannerRef.current = null;
         });
      }
    };
  }, [isOpen, onScan]);

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
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-6 relative bg-stone-50 min-h-[350px] flex items-center justify-center flex-col">
              {error ? (
                <div className="text-center p-4">
                  <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-stone-800 mb-1">Camera Error</p>
                  <p className="text-xs text-stone-600">{error}</p>
                </div>
              ) : (
                <div className="w-full relative shadow-inner rounded-xl overflow-hidden border-2 border-stone-300">
                  <div id="reader" className="w-full bg-black aspect-square object-cover" />
                </div>
              )}
              
              <div className="mt-4 text-center">
                <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
                  Align code within the frame
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
