import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, MessageSquare, Package, Box, Link as LinkIcon, GripVertical, ArrowLeft, ExternalLink } from 'lucide-react';
import { suiscanPackageUrl, suivisionPackageUrl, suiscanModuleUrl, suivisionModuleUrl } from '../utils/explorers';
import TypeModal from './TypeModal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Removed unused Button import

export interface Dependency {
  id: string;
  name: string;
  modules: ModuleInfo[];
}

export interface ModuleInfo {
  name: string;
  id: string;
  types?: string[];
  flags?: string[];
  functions?: Array<{
    name: string;
    visibility: string;
    isEntry?: boolean;
  }>;
  packageId?: string;
}

interface AiInterfaceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  modules?: ModuleInfo[];
  dependencies?: Dependency[];
  packageId?: string;
  network?: string;
  analysisId?: string;
}

type Section = 'summary' | 'package' | 'modules' | 'dependencies';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

const SECTIONS: Record<Section, { title: string; icon: React.ElementType; initialMessage: string }> = {
  summary: {
    title: 'AI Global Summary',
    icon: MessageSquare,
    initialMessage: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.'
  },
  package: {
    title: 'Primary Package Analysis',
    icon: Package,
    initialMessage: 'This section provides an analysis of the primary package. Lorem ipsum dolor sit amet, consectetur adipiscing elit. The package structure appears to be well-organized with clear separation of concerns.'
  },
  modules: {
    title: 'Primary Modules Overview',
    icon: Box,
    initialMessage: 'Here is an overview of the modules in the primary package. Lorem ipsum dolor sit amet. Module A interacts with Module B through defined interfaces.'
  },
  dependencies: {
    title: 'Primary Dependencies',
    icon: LinkIcon,
    initialMessage: 'Analysis of external dependencies. Lorem ipsum dolor sit amet. The project relies on several key external packages for utility functions.'
  }
};

const SECTION_STYLES: Record<Section, { active: string; inactive: string; iconColor: string; chatBubble: string; button: string; ring: string }> = {
  summary: {
    active: 'bg-gray-100 text-gray-900 ring-1 ring-gray-200',
    inactive: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
    iconColor: 'text-gray-500',
    chatBubble: 'bg-gray-600 text-white',
    button: 'bg-gray-600 hover:bg-gray-700',
    ring: 'focus:ring-gray-500'
  },
  package: {
    active: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200',
    inactive: 'text-gray-600 hover:bg-yellow-50 hover:text-yellow-700',
    iconColor: 'text-yellow-600',
    chatBubble: 'bg-yellow-600 text-white',
    button: 'bg-yellow-600 hover:bg-yellow-700',
    ring: 'focus:ring-yellow-500'
  },
  modules: {
    active: 'bg-green-50 text-green-700 ring-1 ring-green-200',
    inactive: 'text-gray-600 hover:bg-green-50 hover:text-green-700',
    iconColor: 'text-green-600',
    chatBubble: 'bg-green-600 text-white',
    button: 'bg-green-600 hover:bg-green-700',
    ring: 'focus:ring-green-500'
  },
  dependencies: {
    active: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    inactive: 'text-gray-600 hover:bg-blue-50 hover:text-blue-700',
    iconColor: 'text-blue-600',
    chatBubble: 'bg-blue-600 text-white',
    button: 'bg-blue-600 hover:bg-blue-700',
    ring: 'focus:ring-blue-500'
  }
};

const MarkdownComponents = {
  p: ({node, ...props}: any) => <p className="text-sm leading-relaxed break-words mb-2 last:mb-0" {...props} />,
  a: ({node, ...props}: any) => <a className="underline hover:no-underline break-all" target="_blank" rel="noopener noreferrer" {...props} />,
  ul: ({node, ...props}: any) => <ul className="list-disc list-inside mb-2 space-y-1" {...props} />,
  ol: ({node, ...props}: any) => <ol className="list-decimal list-inside mb-2 space-y-1" {...props} />,
  li: ({node, ...props}: any) => <li className="text-sm" {...props} />,
  h1: ({node, ...props}: any) => <h1 className="text-lg font-bold mb-2 mt-4 first:mt-0" {...props} />,
  h2: ({node, ...props}: any) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0" {...props} />,
  h3: ({node, ...props}: any) => <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0" {...props} />,
  code: ({node, inline, className, children, ...props}: any) => {
    return inline ? (
      <code className="bg-black/10 px-1 py-0.5 rounded text-xs font-mono break-all" {...props}>
        {children}
      </code>
    ) : (
      <pre className="bg-black/10 p-2 rounded-lg overflow-x-auto text-xs font-mono mb-2">
        <code {...props}>{children}</code>
      </pre>
    );
  },
  blockquote: ({node, ...props}: any) => <blockquote className="border-l-4 border-current pl-4 italic my-2 opacity-80" {...props} />,
  table: ({node, ...props}: any) => <div className="overflow-x-auto mb-2"><table className="min-w-full divide-y divide-current border-current border opacity-80" {...props} /></div>,
  th: ({node, ...props}: any) => <th className="px-3 py-2 bg-black/5 text-left text-xs font-medium uppercase tracking-wider border-b border-current opacity-70" {...props} />,
  td: ({node, ...props}: any) => <td className="px-3 py-2 whitespace-nowrap text-sm border-b border-current opacity-90" {...props} />,
};

export default function AiInterfaceDrawer({ isOpen, onClose, modules = [], dependencies = [], packageId, network = 'mainnet', analysisId }: AiInterfaceDrawerProps) {
  const [currentSection, setCurrentSection] = useState<Section>('summary');
  const [showSubNav, setShowSubNav] = useState(false);
  const [selectedDependency, setSelectedDependency] = useState<Dependency | null>(null);
  const [selectedModule, setSelectedModule] = useState<ModuleInfo | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<Section, Message[]>>({
    summary: [],
    package: [],
    modules: [],
    dependencies: []
  });
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const summaryLoadRef = useRef<boolean>(false); // Track if summary is being loaded
  
  // Resizing state
  const [width, setWidth] = useState(800); // Default width in pixels
  const [isResizing, setIsResizing] = useState(false);
  const [isClosingZone, setIsClosingZone] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();

  // Initialize messages if empty
  useEffect(() => {
    setMessages(prev => {
      const newMessages = { ...prev };
      Object.keys(SECTIONS).forEach((key) => {
        const sectionKey = key as Section;
        if (newMessages[sectionKey].length === 0) {
          newMessages[sectionKey] = [{
            id: 'init-' + sectionKey,
            role: 'ai',
            content: SECTIONS[sectionKey].initialMessage
          }];
        }
      });
      return newMessages;
    });
  }, []);

  useEffect(() => {
    setSelectedDependency(null);
    setSelectedModule(null);
  }, [currentSection]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, currentSection]);

  // Resize handlers
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    if (isClosingZone) {
      onClose();
      setIsClosingZone(false);
    }
  }, [isClosingZone, onClose]);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(() => {
        const newWidth = window.innerWidth - e.clientX;
        
        if (newWidth < 530) {
          setIsClosingZone(true);
          setWidth(530);
        } else if (newWidth < window.innerWidth - 100) {
          setIsClosingZone(false);
          setWidth(newWidth);
        }
      });
    }
  }, [isResizing]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue
    };

    setMessages(prev => ({
      ...prev,
      [currentSection]: [...prev[currentSection], newMessage]
    }));

    setInputValue('');

    // Mock AI response
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: `This is a mock response for the "${SECTIONS[currentSection].title}" section. You said: "${newMessage.content}"`
      };
      setMessages(prev => ({
        ...prev,
        [currentSection]: [...prev[currentSection], aiResponse]
      }));
    }, 1000);
  };

  // Fetch global summary when drawer opens or when entering summary section
  useEffect(() => {
    // Debounce to prevent multiple requests
    const timeoutId = setTimeout(() => {
      const loadGlobalSummary = async () => {
        // Only load if summary section is active, analysisId exists, not already loading, and summary not already loaded
        if (currentSection === 'summary' && analysisId && !loadingSummary && !summaryLoadRef.current) {
          // Check if summary is already in messages
          const hasSummary = messages.summary.some(m => 
            m.id.startsWith('summary-') && !m.id.startsWith('init-')
          );
          
          if (hasSummary) {
            return; // Already loaded
          }

          summaryLoadRef.current = true;
          setLoadingSummary(true);

          try {
            const response = await fetch(`/api/analysis/${analysisId}/global-summary`);
            
            if (!response.ok) {
              if (response.status === 404) {
                // Summary not generated yet (will be generated during analysis)
                setMessages(prev => ({
                  ...prev,
                  summary: [{
                    id: `init-summary`,
                    role: 'ai',
                    content: 'Global summary is being generated. Please wait a moment and refresh.'
                  }]
                }));
                return;
              }
              throw new Error('Failed to fetch global summary');
            }
            
            const data = await response.json();
            if (data.summary) {
              setMessages(prev => {
                const currentMessages = prev.summary;
                // Check if we already have the summary to avoid duplicates
                if (currentMessages.some(m => m.content === data.summary)) {
                  return prev;
                }

                // Replace initial message with actual summary
                return {
                  ...prev,
                  summary: [{
                    id: `summary-${Date.now()}`,
                    role: 'ai',
                    content: data.summary
                  }]
                };
              });
            }
          } catch (error) {
            console.error('Failed to load global summary:', error);
            // Show error message only if we don't have a summary already
            setMessages(prev => {
              if (prev.summary.length === 1 && prev.summary[0].id.startsWith('init-')) {
                return {
                  ...prev,
                  summary: [{
                    id: `error-${Date.now()}`,
                    role: 'ai',
                    content: 'Global summary is not available yet. It will be generated automatically after the analysis completes.'
                  }]
                };
              }
              return prev;
            });
          } finally {
            setLoadingSummary(false);
            summaryLoadRef.current = false;
          }
        }
      };

      loadGlobalSummary();
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [currentSection, analysisId, loadingSummary, messages.summary]);

  // Fetch package explanation when entering package section
  useEffect(() => {
    const loadPackageExplanation = async () => {
      if (currentSection === 'package' && packageId) {
        try {
          const response = await fetch(`/api/packages/${packageId}`);
          if (!response.ok) return;
          
          const data = await response.json();
          if (data.explanation) {
            setMessages(prev => {
              const currentMessages = prev.package;
              // Check if we already have the explanation message to avoid duplicates
              // We check if the content matches or if we have a message with 'expl-' prefix (if we used consistent IDs)
              // Here checking content is safer if IDs are random
              if (currentMessages.some(m => m.content === data.explanation)) {
                return prev;
              }

              // If we only have the initial message, replace it
              if (currentMessages.length === 1 && currentMessages[0].id.startsWith('init-')) {
                return {
                  ...prev,
                  package: [{
                    id: `expl-${Date.now()}`,
                    role: 'ai',
                    content: data.explanation
                  }]
                };
              }

              // Otherwise append it
              return {
                ...prev,
                package: [...currentMessages, {
                  id: `expl-${Date.now()}`,
                  role: 'ai',
                  content: data.explanation
                }]
              };
            });
          }
        } catch (error) {
          console.error('Failed to load package explanation:', error);
        }
      }
    };

    loadPackageExplanation();
  }, [currentSection, packageId]);

  const handleModuleClick = async (module: ModuleInfo) => {
    setSelectedModule(module);
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: `Explain the module ${module.name}`
    };
    
    setMessages(prev => ({
      ...prev,
      [currentSection]: [...prev[currentSection], userMessage]
    }));

    try {
      const response = await fetch(`/api/modules/${module.id}`);
      if (!response.ok) throw new Error('Failed to fetch');
      
      const data = await response.json();
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: data.explanation || "I don't have an explanation for this module yet."
      };

      setMessages(prev => ({
        ...prev,
        [currentSection]: [...prev[currentSection], aiMessage]
      }));
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: "Sorry, I encountered an error while fetching the module explanation."
      };
      setMessages(prev => ({
        ...prev,
        [currentSection]: [...prev[currentSection], errorMessage]
      }));
    }
  };

  const handleDependencyClick = async (dep: Dependency) => {
    setSelectedDependency(dep);
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: `Explain the dependency package ${dep.name}`
    };
    
    setMessages(prev => ({
      ...prev,
      [currentSection]: [...prev[currentSection], userMessage]
    }));

    if (!dep.modules || dep.modules.length === 0) {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: "Not analyzed, dependency of a dependency."
      };

      setMessages(prev => ({
        ...prev,
        [currentSection]: [...prev[currentSection], aiMessage]
      }));
      return;
    }

    try {
      const response = await fetch(`/api/packages/${dep.id}`);
      if (!response.ok) throw new Error('Failed to fetch');
      
      const data = await response.json();
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: data.explanation || "I don't have an explanation for this package yet."
      };

      setMessages(prev => ({
        ...prev,
        [currentSection]: [...prev[currentSection], aiMessage]
      }));
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: "Sorry, I encountered an error while fetching the package explanation."
      };
      setMessages(prev => ({
        ...prev,
        [currentSection]: [...prev[currentSection], errorMessage]
      }));
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={sidebarRef}
      className="fixed top-[80px] right-0 h-[calc(100vh-80px)] z-50 bg-white shadow-2xl flex flex-col border-l border-gray-200"
      style={{ width: `${width}px` }}
    >
        {/* Closing Zone Overlay */}
        {isClosingZone && (
          <div className="absolute inset-0 z-[60] bg-red-500/20 backdrop-blur-[1px] flex flex-col items-center justify-center text-red-600 animate-in fade-in duration-200">
            <div className="bg-white/90 p-6 rounded-2xl shadow-xl flex flex-col items-center gap-3 border-2 border-red-100">
              <div className="p-3 bg-red-100 rounded-full">
                <X className="w-8 h-8 text-red-600" />
              </div>
              <span className="font-bold text-lg">Closing Drawer</span>
              <span className="text-sm text-red-500/80">Release to close</span>
            </div>
          </div>
        )}

        {/* Resize Handle */}
        <div
          className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-12 bg-white border border-gray-200 rounded-l-lg shadow-md flex items-center justify-center cursor-ew-resize hover:bg-gray-50 z-50"
          onMouseDown={startResizing}
        >
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>

        {/* Header */}
        <div className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-gray-50">
          <div className="w-8"></div> {/* Spacer for centering */}
          <h2 className="text-xl font-bold text-gray-800">AI Interface</h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          
          {/* Chat Area */}
          <div className="flex-1 flex flex-col bg-white">
            <div className="h-14 border-b border-gray-100 flex items-center px-6">
              <h3 className={`font-semibold text-lg flex items-center gap-2 ${SECTION_STYLES[currentSection].iconColor}`}>
                {React.createElement(SECTIONS[currentSection].icon, { className: "w-5 h-5" })}
                {SECTIONS[currentSection].title}
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50">
              {loadingSummary && currentSection === 'summary' && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-bl-none px-5 py-3 shadow-sm">
                    <p className="text-sm text-gray-500">Loading global summary...</p>
                  </div>
                </div>
              )}
              {messages[currentSection].map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`max-w-[80%] rounded-2xl px-5 py-3 shadow-sm ${
                      msg.role === 'user' 
                        ? `${SECTION_STYLES[currentSection].chatBubble} rounded-br-none` 
                        : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
                    }`}
                  >
                    {msg.role === 'ai' ? (
                      <ReactMarkdown 
                        components={MarkdownComponents}
                        remarkPlugins={[remarkGfm]}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      <p className="text-sm leading-relaxed break-words">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-gray-200 bg-white">
              <form onSubmit={handleSendMessage} className="flex gap-3">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask something about this section..."
                  className={`flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:bg-white transition-all ${SECTION_STYLES[currentSection].ring}`}
                />
                <button 
                  type="submit"
                  disabled={!inputValue.trim()}
                  className={`px-4 py-2 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium ${SECTION_STYLES[currentSection].button}`}
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
              </form>
            </div>
          </div>

          {/* Navigation Column */}
          <div className="w-72 bg-gray-50 border-l border-gray-200 flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <h3 
                className="font-bold text-gray-700 uppercase text-xs tracking-wider cursor-pointer flex items-center gap-2"
                onClick={() => {
                  if (selectedModule) {
                    setSelectedModule(null);
                  } else if (selectedDependency) {
                    setSelectedDependency(null);
                  } else {
                    setShowSubNav(false);
                  }
                }}
              >
                {showSubNav && <ArrowLeft className="w-3 h-3" />}
                {showSubNav 
                  ? (selectedModule ? selectedModule.name : selectedDependency ? selectedDependency.name : (currentSection === 'summary' ? 'Global Summary' : SECTIONS[currentSection].title))
                  : 'AI Navigation'}
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {!showSubNav ? (
                (Object.keys(SECTIONS) as Section[]).map((section) => (
                  <button
                    key={section}
                    onClick={() => {
                      setCurrentSection(section);
                      if (section !== 'summary') {
                        setShowSubNav(true);
                      }
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${
                      currentSection === section
                        ? SECTION_STYLES[section].active
                        : SECTION_STYLES[section].inactive
                    }`}
                  >
                    {React.createElement(SECTIONS[section].icon, { 
                      className: `w-4 h-4 ${currentSection === section ? '' : SECTION_STYLES[section].iconColor}` 
                    })}
                    <span className="text-sm">{section === 'summary' ? 'Global Summary' : SECTIONS[section].title}</span>
                  </button>
                ))
              ) : selectedModule ? (
                <div className="space-y-4">
                  {/* View Code */}
                  {selectedModule.packageId && (
                    <div>
                      <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        View Code
                      </div>
                      <div className="space-y-2">
                        <a
                          href={suiscanModuleUrl(selectedModule.packageId, selectedModule.name, network as any)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full text-left px-4 py-2 rounded-lg flex items-center gap-3 transition-all text-blue-600 bg-blue-50 hover:bg-blue-100"
                        >
                          <ExternalLink className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sm">View on SuiScan</span>
                        </a>
                        <a
                          href={suivisionModuleUrl(selectedModule.packageId, selectedModule.name, network as any)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full text-left px-4 py-2 rounded-lg flex items-center gap-3 transition-all text-green-600 bg-green-50 hover:bg-green-100"
                        >
                          <ExternalLink className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sm">View on SuiVision</span>
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Security Flags */}
                  {selectedModule.flags && selectedModule.flags.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        Security Flags
                      </div>
                      <div className="space-y-1">
                        {selectedModule.flags.map((flag, idx) => (
                          <div key={idx} className="text-xs font-semibold text-red-700 bg-red-50 p-2 rounded border border-red-200 flex items-center gap-2">
                            <span>⚠️</span>
                            {flag}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Types */}
                  <div>
                    <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Types
                    </div>
                    {selectedModule.types && selectedModule.types.length > 0 ? (
                      <div className="space-y-1">
                        {selectedModule.types.map((type) => (
                          <button 
                            key={type}
                            onClick={() => setSelectedType(type)}
                            className="w-full text-left px-4 py-2 rounded-lg flex items-center gap-3 text-purple-900 bg-purple-50 hover:bg-purple-100 transition-colors"
                          >
                            <div className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                            <span className="text-sm truncate" title={type}>{type.split('::').pop()}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-sm text-gray-500 italic">
                        No types found in this module
                      </div>
                    )}
                  </div>

                  {/* Functions */}
                  {selectedModule.functions && selectedModule.functions.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        Functions ({selectedModule.functions.length})
                      </div>
                      <div className="space-y-1">
                        {selectedModule.functions.map((func, idx) => (
                          <div key={idx} className="w-full text-left px-4 py-2 rounded-lg bg-gray-100 border border-gray-200">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-mono font-semibold text-gray-800">{func.name}</span>
                              {func.isEntry && (
                                <span className="text-[10px] uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                                  Entry
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 capitalize">
                              {func.visibility.toLowerCase()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                (currentSection === 'modules' && modules.length > 0) ? (
                  modules.map((module) => (
                    <button
                      key={module.id}
                      onClick={() => handleModuleClick(module)}
                      className="w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all text-gray-600 hover:bg-green-50 hover:text-green-700"
                    >
                      <Box className="w-4 h-4 flex-shrink-0 text-green-600" />
                      <span className="text-sm truncate" title={module.name}>{module.name}</span>
                    </button>
                  ))
                ) : (currentSection === 'package' && packageId) ? (
                  <div className="space-y-2">
                    <a
                      href={suiscanPackageUrl(packageId, network as any)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all text-gray-600 hover:bg-yellow-50 hover:text-yellow-700"
                    >
                      <ExternalLink className="w-4 h-4 flex-shrink-0 text-yellow-600" />
                      <span className="text-sm">View on SuiScan</span>
                    </a>
                    <a
                      href={suivisionPackageUrl(packageId, network as any)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all text-gray-600 hover:bg-yellow-50 hover:text-yellow-700"
                    >
                      <ExternalLink className="w-4 h-4 flex-shrink-0 text-yellow-600" />
                      <span className="text-sm">View on SuiVision</span>
                    </a>
                  </div>
                ) : (currentSection === 'dependencies' && dependencies.length > 0) ? (
                  selectedDependency ? (
                    selectedDependency.modules.map((module) => (
                      <button
                        key={module.id}
                        onClick={() => handleModuleClick(module)}
                        className="w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all text-gray-600 hover:bg-green-50 hover:text-green-700"
                      >
                        <Box className="w-4 h-4 flex-shrink-0 text-green-600" />
                        <span className="text-sm truncate" title={module.name}>{module.name}</span>
                      </button>
                    ))
                  ) : (
                    dependencies.map((dep) => (
                      <button
                        key={dep.id}
                        onClick={() => handleDependencyClick(dep)}
                        className="w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all text-gray-600 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <LinkIcon className="w-4 h-4 flex-shrink-0 text-blue-600" />
                        <span className="text-sm truncate" title={dep.name}>{dep.name}</span>
                      </button>
                    ))
                  )
                ) : (
                  ['1', '2', '3'].map((item) => (
                    <button
                      key={item}
                      className="w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                    >
                      <span className="text-sm">Mock Button {item}</span>
                    </button>
                  ))
                )
              )}
            </div>
          </div>

        </div>
      {selectedType && analysisId && (
        <TypeModal
          typeFqn={selectedType}
          analysisId={analysisId}
          onClose={() => setSelectedType(null)}
        />
      )}
    </div>
  );
}
