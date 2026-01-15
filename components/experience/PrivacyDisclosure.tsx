'use client';

// Privacy Disclosure Component
// Clear, human-readable disclosure about data collection

export function PrivacyDisclosure() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Privacy & Data Collection</h3>
      
      <div className="space-y-3 text-sm text-gray-700">
        <div>
          <p className="font-medium mb-1">What we collect:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Anonymous feedback about your experience</li>
            <li>Optional context (dose, setting, first time)</li>
            <li>General location (country/state only, not precise)</li>
          </ul>
        </div>
        
        <div>
          <p className="font-medium mb-1">What we don't collect:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Your name, email, or account information</li>
            <li>Precise location or GPS coordinates</li>
            <li>Any personally identifying information</li>
          </ul>
        </div>
        
        <div>
          <p className="font-medium mb-1">How we use your data:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Data is used only in aggregate for product insights</li>
            <li>No individual responses are shared or published</li>
            <li>Participation is completely optional</li>
          </ul>
        </div>
        
        <p className="text-xs text-gray-600 italic">
          Your privacy is important to us. All responses are anonymous and aggregated.
        </p>
      </div>
    </div>
  );
}

