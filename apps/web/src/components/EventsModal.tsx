import { useEffect, useState } from 'react';
import type { EventNode } from '@suilens/core';

interface EventsModalProps {
  analysisId: string;
  scope: 'pkg' | 'mod';
  id: string; // packageId or moduleFqn
  title: string;
  onClose: () => void;
}

interface EventsResponse {
  items: EventNode[];
  nextCursor?: string | null | { txDigest: string; eventSeq: string };
  hasNextPage?: boolean;
}

type CursorType = string | null | { txDigest: string; eventSeq: string };

export default function EventsModal({ analysisId, scope, id, title, onClose }: EventsModalProps) {
  const [events, setEvents] = useState<EventNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<CursorType>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [cursorHistory, setCursorHistory] = useState<CursorType[]>([null]); // Stack for previous cursors
  const [currentPage, setCurrentPage] = useState(0);
  const [network, setNetwork] = useState<string>('mainnet');

  // Fetch network info on mount
  useEffect(() => {
    const fetchNetwork = async () => {
      try {
        const response = await fetch(`/api/analysis/${analysisId}`);
        if (response.ok) {
          const data = await response.json();
          if (data._metadata?.network) {
            setNetwork(data._metadata.network);
          }
        }
      } catch (error) {
        console.error('Failed to fetch network info:', error);
      }
    };
    fetchNetwork();
  }, [analysisId]);

  useEffect(() => {
    fetchEvents(null);
  }, [analysisId, scope, id]);

  const fetchEvents = async (pageCursor: string | null | { txDigest: string; eventSeq: string }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        scope,
        id,
        limit: '30',
      });
      
      // Serialize cursor object to JSON if it's an object, or use as-is if it's a string
      if (pageCursor && pageCursor !== 'null') {
        const cursorString = typeof pageCursor === 'object' 
          ? JSON.stringify(pageCursor) 
          : pageCursor;
        params.append('cursor', cursorString);
      }

      console.log('EventsModal: Fetching events with params:', {
        analysisId,
        scope,
        id,
        cursor: pageCursor,
      });

      const response = await fetch(`/api/analysis/${analysisId}/events?${params}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('EventsModal: Failed to fetch events:', response.status, errorText);
        throw new Error(`Failed to fetch events: ${response.status} ${errorText}`);
      }

      const data: EventsResponse = await response.json();
      console.log('EventsModal: Received events:', {
        itemCount: data.items?.length || 0,
        nextCursor: data.nextCursor,
        hasNextPage: data.hasNextPage,
        firstEvent: data.items?.[0],
        lastEvent: data.items?.[data.items?.length - 1],
      });
      
      if (!data.items || data.items.length === 0) {
        console.warn('EventsModal: No events returned from server');
      }
      
      setEvents(data.items || []);
      setCursor(data.nextCursor || null);
      setHasNextPage(data.hasNextPage || false);
    } catch (error) {
      console.error('Failed to fetch events:', error);
      alert('Failed to fetch events: ' + (error as Error).message);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleNextPage = () => {
    if (!cursor || !hasNextPage) {
      console.warn('EventsModal: Cannot go to next page', { cursor, hasNextPage });
      return;
    }
    
    console.log('EventsModal: Going to next page with cursor:', JSON.stringify(cursor, null, 2));
    
    // Save current cursor to history
    setCursorHistory([...cursorHistory, cursor]);
    setCurrentPage(currentPage + 1);
    fetchEvents(cursor);
  };

  const handlePrevPage = () => {
    if (currentPage === 0) return;
    
    // Go back to previous cursor
    const newHistory = [...cursorHistory];
    newHistory.pop(); // Remove current cursor
    const prevCursor = newHistory[newHistory.length - 1];
    
    setCursorHistory(newHistory);
    setCurrentPage(currentPage - 1);
    fetchEvents(prevCursor);
  };

  const formatTimestamp = (ts?: number) => {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleString();
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-yellow-600 to-yellow-800 text-white px-6 py-4 flex justify-between items-center">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">Recent Events</h2>
              <span className={`px-2 py-1 text-xs font-bold rounded ${
                network === 'mainnet' ? 'bg-green-500' :
                network === 'testnet' ? 'bg-blue-500' :
                'bg-purple-500'
              }`}>
                {network.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-yellow-100 mt-1">Module: {title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-600"></div>
            </div>
          ) : events.length > 0 ? (
            <div className="space-y-4">
              {events.map((evt, idx) => {
                // Extract event type name from full path (e.g., "Package::Module::EventName" -> "EventName")
                const eventTypeName = evt.kind?.split('::').pop() || 'Unknown Event';
                const eventPackage = evt.kind?.split('::')[0] || 'N/A';
                
                return (
                  <div key={evt.id || idx} className="bg-white rounded-lg p-4 border-2 border-gray-200 hover:border-yellow-400 transition-colors shadow-sm">
                    {/* Event Type Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-3 py-1.5 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white text-sm font-bold rounded-md shadow-sm">
                            {eventTypeName}
                          </span>
                          {evt.kind && evt.kind.includes('::') && (
                            <span className="text-xs text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded">
                              {evt.kind.split('::').slice(0, -1).join('::')}
                            </span>
                          )}
                        </div>
                        {evt.ts && (
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {formatTimestamp(evt.ts)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Event Details Grid */}
                    <div className="space-y-2">
                      {/* Full Event Type */}
                      {evt.kind && (
                        <div className="bg-gray-50 p-2 rounded">
                          <div className="text-xs font-semibold text-gray-600 mb-1">Event Type</div>
                          <code className="text-xs font-mono text-gray-800 break-all leading-relaxed">
                            {evt.kind}
                          </code>
                        </div>
                      )}

                      {/* Transaction Digest */}
                      {evt.tx && (
                        <div className="bg-blue-50 p-2 rounded">
                          <div className="text-xs font-semibold text-blue-700 mb-1">Transaction</div>
                          <code className="text-xs font-mono text-blue-900 break-all">
                            {evt.tx}
                          </code>
                        </div>
                      )}

                      {/* Sender */}
                      {evt.sender && (
                        <div className="bg-green-50 p-2 rounded">
                          <div className="text-xs font-semibold text-green-700 mb-1">Sender</div>
                          <code className="text-xs font-mono text-green-900 break-all">
                            {evt.sender}
                          </code>
                        </div>
                      )}

                      {/* Package ID */}
                      {eventPackage && eventPackage !== 'N/A' && (
                        <div className="bg-purple-50 p-2 rounded">
                          <div className="text-xs font-semibold text-purple-700 mb-1">Package</div>
                          <code className="text-xs font-mono text-purple-900 break-all">
                            {eventPackage}
                          </code>
                        </div>
                      )}

                      {/* Parsed Event Data */}
                      {evt.data && Object.keys(evt.data).length > 0 && (
                        <div className="bg-yellow-50 p-2 rounded border border-yellow-200">
                          <details className="text-xs">
                            <summary className="cursor-pointer text-yellow-800 hover:text-yellow-900 font-semibold flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                              Event Data ({Object.keys(evt.data).length} fields)
                            </summary>
                            <pre className="mt-2 text-xs bg-white p-3 rounded overflow-x-auto border border-yellow-300 max-h-60 overflow-y-auto">
                              {JSON.stringify(evt.data, null, 2)}
                            </pre>
                          </details>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No events found
            </div>
          )}
        </div>

        {/* Footer with Pagination */}
        <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-t">
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 0}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          
          <span className="text-sm text-gray-600">
            Page {currentPage + 1} {events.length > 0 && `(${events.length} events)`}
          </span>
          
          <button
            onClick={handleNextPage}
            disabled={!hasNextPage || !cursor}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

