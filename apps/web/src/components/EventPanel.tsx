import { suiscanTxUrl, suiexplorerTxUrl } from '../utils/explorers';

interface EventPanelProps {
  node: any;
  onClose: () => void;
}

export default function EventPanel({ node, onClose }: EventPanelProps) {
  const eventData = node.data || {};
  const kind = eventData.kind || 'Unknown';
  const eventId = eventData.eventId || '';
  const tx = eventId.split(':')[0];

  const kindColors: Record<string, { bg: string; text: string }> = {
    Publish: { bg: 'bg-green-100', text: 'text-green-800' },
    Upgrade: { bg: 'bg-blue-100', text: 'text-blue-800' },
    Mint: { bg: 'bg-purple-100', text: 'text-purple-800' },
    Burn: { bg: 'bg-red-100', text: 'text-red-800' },
    Custom: { bg: 'bg-gray-100', text: 'text-gray-800' },
  };

  const colors = kindColors[kind] || kindColors.Custom;

  return (
    <div className="w-96 h-full bg-white shadow-2xl border-l border-gray-200 overflow-y-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Event Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Event Kind Badge */}
        <div className="mb-6">
          <span className={`inline-block px-3 py-2 rounded-lg text-base font-bold ${colors.bg} ${colors.text}`}>
            {kind}
          </span>
        </div>

        {/* Event ID */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Event ID</h3>
          <div className="font-mono text-xs text-gray-800 break-all bg-gray-50 p-2 rounded">
            {eventId}
          </div>
        </div>

        {/* Transaction */}
        {tx && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Transaction</h3>
            <div className="font-mono text-xs text-gray-800 break-all bg-gray-50 p-2 rounded">
              {tx}
            </div>
          </div>
        )}

        {/* Explorer Links */}
        {tx && (
          <div className="mt-6 space-y-2">
            <a
              href={suiscanTxUrl(tx)}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full px-4 py-2 bg-blue-500 text-white text-center rounded hover:bg-blue-600 transition-colors"
            >
              View Transaction on SuiScan
            </a>
            <a
              href={suiexplorerTxUrl(tx)}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full px-4 py-2 bg-green-500 text-white text-center rounded hover:bg-green-600 transition-colors"
            >
              View Transaction on Sui Explorer
            </a>
          </div>
        )}

        {/* Info Box */}
        <div className="mt-6 p-4 bg-blue-50 rounded border border-blue-200">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">About this event:</h3>
          <p className="text-sm text-blue-800">
            {getEventDescription(kind)}
          </p>
        </div>
      </div>
    </div>
  );
}

function getEventDescription(kind: string): string {
  const descriptions: Record<string, string> = {
    Publish: 'This event was emitted when the package was first published to the blockchain.',
    Upgrade: 'This event was emitted when the package was upgraded to a new version.',
    Mint: 'This event indicates that new tokens or assets were minted.',
    Burn: 'This event indicates that tokens or assets were burned (destroyed).',
    Custom: 'This is a custom event emitted by the package logic.',
  };
  return descriptions[kind] || 'This event was emitted by the package.';
}

