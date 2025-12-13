'use client';

import { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import TooltipWrapper from '@/components/ui/TooltipWrapper';

interface QRCodeDisplayProps {
  url: string;
  materialName: string;
  userRole?: string;
}

export default function QRCodeDisplay({ url, materialName, userRole }: QRCodeDisplayProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Generate QR code
    const generateQR = async () => {
      try {
        setIsLoading(true);
        
        // Generate QR code as data URL
        const dataUrl = await QRCode.toDataURL(url, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });
        
        setQrDataUrl(dataUrl);
        
        // Also render to canvas for printing
        if (canvasRef.current) {
          await QRCode.toCanvas(canvasRef.current, url, {
            width: 300,
            margin: 2,
          });
        }
      } catch (error) {
        console.error('Error generating QR code:', error);
      } finally {
        setIsLoading(false);
      }
    };

    generateQR();
  }, [url]);

  const handleDownload = () => {
    if (!qrDataUrl) return;

    // Create download link
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `QR-${materialName.replace(/[^a-z0-9]/gi, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <div className="animate-pulse">
          <div className="h-64 w-64 bg-gray-200 rounded mx-auto"></div>
          <div className="mt-4 h-4 bg-gray-200 rounded w-32 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-4 text-center">QR Code</h2>
      
      {/* QR Code Display */}
      <div className="flex justify-center mb-4">
        <div className="border-4 border-gray-200 rounded-lg p-4 bg-white">
          {qrDataUrl ? (
            <img 
              src={qrDataUrl} 
              alt={`QR Code for ${materialName}`}
              className="w-64 h-64"
            />
          ) : (
            <canvas ref={canvasRef} className="w-64 h-64" />
          )}
        </div>
      </div>

      {/* Material Label */}
      <div className="text-center mb-4">
        <p className="text-sm font-medium text-gray-900">{materialName}</p>
        <p className="text-xs text-gray-500 mt-1 break-all">{url}</p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-center print:hidden">
        <TooltipWrapper tooltipId="qr-download" userRole={userRole} position="top">
          <button
            onClick={handleDownload}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PNG
          </button>
        </TooltipWrapper>
        <TooltipWrapper tooltipId="qr-print" userRole={userRole} position="top">
          <button
            onClick={handlePrint}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
        </TooltipWrapper>
      </div>

      {/* Print-only styles */}
      <style jsx>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .bg-white.rounded-lg.shadow.p-6 {
            visibility: visible;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .bg-white.rounded-lg.shadow.p-6 * {
            visibility: visible;
          }
        }
      `}</style>
    </div>
  );
}

