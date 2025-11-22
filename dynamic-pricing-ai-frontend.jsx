import React, { useState, useEffect } from 'react';
import { AlertCircle, DollarSign, Users, Mail, TrendingUp, Calendar, Package, Target, CheckCircle, Server } from 'lucide-react';

const DynamicPricingAI = () => {
  const [backendUrl, setBackendUrl] = useState('http://localhost:3001');
  const [backendConnected, setBackendConnected] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [pricingStrategy, setPricingStrategy] = useState('retention');
  const [campaignName, setCampaignName] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState(null);

  const pricingStrategies = {
    retention: {
      name: 'Customer Retention',
      description: 'Reward loyal customers with personalized discounts to increase LTV',
      icon: <Users className="w-5 h-5" />
    },
    reactivation: {
      name: 'Win-Back Campaign',
      description: 'Re-engage inactive customers with compelling offers',
      icon: <TrendingUp className="w-5 h-5" />
    },
    upsell: {
      name: 'Premium Upsell',
      description: 'Encourage high-value customers to purchase more',
      icon: <Package className="w-5 h-5" />
    },
    acquisition: {
      name: 'New Customer Acquisition',
      description: 'Competitive pricing for first-time buyers',
      icon: <Target className="w-5 h-5" />
    }
  };

  // Check backend connection on mount and when URL changes
  useEffect(() => {
    checkBackendConnection();
  }, [backendUrl]);

  const checkBackendConnection = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/health`);
      const data = await response.json();
      
      if (data.status === 'ok') {
        setBackendConnected(true);
        setStatus(`✅ Connected to backend server! Shopify: ${data.hasShopifyKey ? '✓' : '✗'}, MailerLite: ${data.hasMailerliteKey ? '✓' : '✗'}`);
      }
    } catch (error) {
      setBackendConnected(false);
      setStatus('❌ Cannot connect to backend server. Make sure it is running on ' + backendUrl);
    }
  };

  const fetchShopifyCustomers = async () => {
    setLoading(true);
    setStatus('Fetching customer data from Shopify...');
    
    try {
      const response = await fetch(`${backendUrl}/api/shopify/customers`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch customers');
      }

      const data = await response.json();
      setCustomers(data.customers);
      setStatus(`Successfully loaded ${data.customers.length} customers`);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const analyzeWithClaude = async (customerSegment) => {
    setStatus('Analyzing customer data with Claude AI...');
    
    try {
      const response = await fetch(`${backendUrl}/api/claude/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customerSegment,
          pricingStrategy,
          strategyInfo: pricingStrategies[pricingStrategy]
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'AI analysis failed');
      }

      const analysis = await response.json();
      setAiAnalysis(analysis);
      setStatus('AI analysis complete! Review recommendations below.');
      
      return analysis;
    } catch (error) {
      setStatus(`AI Analysis Error: ${error.message}`);
      console.error('Claude API Error:', error);
      return null;
    }
  };

  const createDiscountsAndCampaign = async () => {
    if (!aiAnalysis || selectedCustomers.length === 0) {
      setStatus('Please analyze customers first and select recipients');
      return;
    }

    setLoading(true);
    setStatus('Starting campaign creation process...');

    try {
      // Get selected customer recommendations
      const selectedRecommendations = aiAnalysis.customerRecommendations.filter(rec =>
        selectedCustomers.includes(rec.customerId)
      );

      // Step 1: Create discount codes in Shopify
      setStatus('Step 1/3: Creating discount codes in Shopify...');
      const discountResponse = await fetch(`${backendUrl}/api/shopify/discounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          recommendations: selectedRecommendations
        })
      });

      if (!discountResponse.ok) {
        const error = await discountResponse.json();
        throw new Error(error.error || 'Failed to create discount codes');
      }

      const discountResult = await discountResponse.json();
      
      if (discountResult.failedCodes.length > 0) {
        setStatus(`⚠️ Warning: ${discountResult.failedCodes.length} discount codes failed to create.`);
        console.error('Failed discount codes:', discountResult.failedCodes);
      }

      setStatus(`✅ Created ${discountResult.createdCodes.length} discount codes in Shopify.`);

      // Step 2: Create MailerLite campaign
      setStatus('Step 2/3: Creating MailerLite campaign...');
      const campaignResponse = await fetch(`${backendUrl}/api/mailerlite/campaign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          campaignName: campaignName || `Dynamic Pricing - ${pricingStrategy} - ${new Date().toLocaleDateString()}`,
          pricingStrategy,
          selectedRecommendations
        })
      });

      if (!campaignResponse.ok) {
        const error = await campaignResponse.json();
        throw new Error(error.error || 'Failed to create campaign');
      }

      const campaignResult = await campaignResponse.json();

      setStatus(`✅ Complete! Created ${discountResult.createdCodes.length} Shopify discount codes and MailerLite campaign with ${campaignResult.addedCount} subscribers. Campaign ready to send in MailerLite dashboard.`);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      console.error('Campaign creation error:', error);
    } finally {
      setLoading(false);
    }
  };

  const analyzeSelectedCustomers = async () => {
    const selected = customers.filter(c => selectedCustomers.includes(c.id));
    if (selected.length === 0) {
      setStatus('Please select customers to analyze');
      return;
    }
    await analyzeWithClaude(selected);
  };

  const toggleCustomerSelection = (customerId) => {
    setSelectedCustomers(prev => 
      prev.includes(customerId) 
        ? prev.filter(id => id !== customerId)
        : [...prev, customerId]
    );
  };

  const selectAllInactive = () => {
    const inactive = customers.filter(c => c.daysSinceLastOrder > 60).map(c => c.id);
    setSelectedCustomers(inactive);
  };

  const selectAllHighValue = () => {
    const highValue = customers.filter(c => c.totalSpent > 100).map(c => c.id);
    setSelectedCustomers(highValue);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-8 h-8 text-purple-600" />
            <h1 className="text-3xl font-bold text-gray-800">Dynamic Pricing AI</h1>
          </div>
          <p className="text-gray-600">AI-powered personalized pricing for Daily N'Oats customer reactivation</p>
        </div>

        {/* Backend Connection Status */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Server className="w-5 h-5 text-purple-600" />
            Backend Server Configuration
          </h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Backend Server URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="http://localhost:3001"
              />
              <button
                onClick={checkBackendConnection}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
              >
                Test Connection
              </button>
            </div>
          </div>

          <div className={`flex items-center gap-2 p-3 rounded-lg ${backendConnected ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {backendConnected ? (
              <>
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Backend Connected</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Backend Not Connected</span>
              </>
            )}
          </div>

          {!backendConnected && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Setup Required:</strong> Start the backend server first:
              </p>
              <pre className="mt-2 p-2 bg-gray-800 text-green-400 rounded text-xs overflow-x-auto">
cd backend{'\n'}
npm install{'\n'}
npm start
              </pre>
            </div>
          )}
        </div>

        {/* Status Messages */}
        {status && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-blue-800">{status}</p>
          </div>
        )}

        {/* Fetch Customers Button */}
        {backendConnected && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Load Customer Data</h2>
            <button
              onClick={fetchShopifyCustomers}
              disabled={loading}
              className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Fetch Customer Data from Shopify'}
            </button>
          </div>
        )}

        {/* Pricing Strategy Selection */}
        {customers.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Select Pricing Strategy</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(pricingStrategies).map(([key, strategy]) => (
                <div
                  key={key}
                  onClick={() => setPricingStrategy(key)}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    pricingStrategy === key
                      ? 'border-purple-600 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-300'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg ${pricingStrategy === key ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {strategy.icon}
                    </div>
                    <h3 className="font-bold">{strategy.name}</h3>
                  </div>
                  <p className="text-sm text-gray-600">{strategy.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Customer List */}
        {customers.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-600" />
                Customer Data ({customers.length})
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={selectAllInactive}
                  className="text-sm bg-orange-100 text-orange-700 px-3 py-1 rounded hover:bg-orange-200"
                >
                  Select Inactive (60+ days)
                </button>
                <button
                  onClick={selectAllHighValue}
                  className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded hover:bg-green-200"
                >
                  Select High-Value ($100+)
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">
                      <input
                        type="checkbox"
                        checked={selectedCustomers.length === customers.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCustomers(customers.map(c => c.id));
                          } else {
                            setSelectedCustomers([]);
                          }
                        }}
                        className="w-4 h-4"
                      />
                    </th>
                    <th className="px-4 py-2 text-left">Email</th>
                    <th className="px-4 py-2 text-left">Orders</th>
                    <th className="px-4 py-2 text-left">Total Spent</th>
                    <th className="px-4 py-2 text-left">AOV</th>
                    <th className="px-4 py-2 text-left">Days Since Order</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedCustomers.includes(customer.id)}
                          onChange={() => toggleCustomerSelection(customer.id)}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div>
                          <div className="font-medium">{customer.firstName} {customer.lastName}</div>
                          <div className="text-sm text-gray-500">{customer.email}</div>
                        </div>
                      </td>
                      <td className="px-4 py-2">{customer.totalOrders}</td>
                      <td className="px-4 py-2">${customer.totalSpent.toFixed(2)}</td>
                      <td className="px-4 py-2">${customer.averageOrderValue.toFixed(2)}</td>
                      <td className="px-4 py-2">
                        <span className={customer.daysSinceLastOrder > 60 ? 'text-red-600 font-medium' : ''}>
                          {customer.daysSinceLastOrder > 999 ? 'Never' : `${customer.daysSinceLastOrder} days`}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {customer.daysSinceLastOrder > 90 ? (
                          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">Inactive</span>
                        ) : customer.daysSinceLastOrder > 60 ? (
                          <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">At Risk</span>
                        ) : (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Active</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex gap-4">
              <button
                onClick={analyzeSelectedCustomers}
                disabled={loading || selectedCustomers.length === 0}
                className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Analyze {selectedCustomers.length} Selected Customer{selectedCustomers.length !== 1 ? 's' : ''} with AI
              </button>
            </div>
          </div>
        )}

        {/* AI Analysis Results */}
        {aiAnalysis && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              AI Pricing Recommendations
            </h2>

            {/* Campaign Projection */}
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6 mb-6">
              <h3 className="font-bold text-lg mb-4">Campaign Projection</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-white p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Expected Conversion</div>
                  <div className="text-2xl font-bold text-purple-600">{aiAnalysis.campaignProjection.expectedConversionRate}</div>
                </div>
                <div className="bg-white p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Projected Revenue</div>
                  <div className="text-2xl font-bold text-green-600">{aiAnalysis.campaignProjection.projectedRevenue}</div>
                </div>
                <div className="bg-white p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Expected ROI</div>
                  <div className="text-2xl font-bold text-blue-600">{aiAnalysis.campaignProjection.projectedROI}</div>
                </div>
              </div>
              
              <div className="bg-white p-4 rounded-lg">
                <h4 className="font-bold mb-2">Strategic Insights</h4>
                <ul className="space-y-1">
                  {aiAnalysis.strategicInsights.map((insight, idx) => (
                    <li key={idx} className="text-sm text-gray-700">• {insight}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Individual Recommendations */}
            <h3 className="font-bold text-lg mb-3">Individual Customer Recommendations</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {aiAnalysis.customerRecommendations.map((rec, idx) => (
                <div key={idx} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-medium">{rec.email}</div>
                      <div className="text-sm text-gray-600 mt-1">{rec.messagingAngle}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-purple-600">{rec.discountPercent}% OFF</div>
                      <div className="text-sm text-gray-600">Code: {rec.discountCode}</div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                    <strong>Rationale:</strong> {rec.rationale}
                  </div>
                  <div className="text-sm text-green-600 mt-2">
                    Expected value: ${rec.expectedValue.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {/* Campaign Setup */}
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Mail className="w-5 h-5 text-purple-600" />
                Launch Email Campaign
              </h3>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Campaign Name</label>
                <input
                  type="text"
                  placeholder="e.g., Win-Back November 2024"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>

              {/* Discount Codes Summary */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                <h4 className="font-bold text-sm mb-2 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-purple-600" />
                  Discount Codes to be Created in Shopify:
                </h4>
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set(
                    aiAnalysis.customerRecommendations
                      .filter(rec => selectedCustomers.includes(rec.customerId))
                      .map(rec => `${rec.discountCode} (${rec.discountPercent}% off)`)
                  )).map((code, idx) => (
                    <span key={idx} className="bg-white px-3 py-1 rounded-full text-sm font-medium text-purple-700 border border-purple-300">
                      {code}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  ✅ Valid for 7 days • One use per customer • Automatically applied at checkout
                </p>
              </div>

              <button
                onClick={createDiscountsAndCampaign}
                disabled={loading || selectedCustomers.length === 0}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Mail className="w-5 h-5" />
                Create Discount Codes & Launch Campaign ({selectedCustomers.length} recipients)
              </button>
              
              <p className="text-sm text-gray-600 mt-2">
                <strong>Step 1:</strong> Creates discount codes in Shopify (7-day expiration, one-time use)<br/>
                <strong>Step 2:</strong> Sets up MailerLite subscriber group<br/>
                <strong>Step 3:</strong> Creates personalized email campaign ready to send from your MailerLite dashboard
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DynamicPricingAI;
