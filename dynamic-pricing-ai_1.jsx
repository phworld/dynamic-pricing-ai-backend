import React, { useState } from 'react';
import {
  AlertCircle,
  DollarSign,
  Users,
  Mail,
  TrendingUp,
  Package,
  Target,
} from 'lucide-react';

// Backend base URL (Render / Node server)
const API_BASE =
  process.env.REACT_APP_DNO_AI_BASE || 'https://dailynoats-ai.onrender.com';

const DynamicPricingAI = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [pricingStrategy, setPricingStrategy] = useState('retention');
  const [campaignName, setCampaignName] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const pricingStrategies = {
    retention: {
      name: 'Customer Retention',
      description: 'Reward loyal customers with personalized discounts to increase LTV.',
      icon: <Users className="w-5 h-5" />,
    },
    reactivation: {
      name: 'Win-Back Campaign',
      description: 'Re-engage inactive customers with compelling offers.',
      icon: <TrendingUp className="w-5 h-5" />,
    },
    upsell: {
      name: 'Premium Upsell',
      description: 'Encourage high-value customers to purchase more.',
      icon: <Package className="w-5 h-5" />,
    },
    acquisition: {
      name: 'New Customer Acquisition',
      description: 'Competitive pricing for first-time buyers.',
      icon: <Target className="w-5 h-5" />,
    },
  };

  /* ----------------------------------------------------
   * Segment helpers
   * ---------------------------------------------------- */

  const autoSelectForStrategy = (strategyKey, allCustomers) => {
    const list = allCustomers || customers;
    if (!list.length) return [];

    switch (strategyKey) {
      case 'retention':
        // Loyal + relatively recent
        return list
          .filter(
            (c) =>
              c.totalOrders >= 2 &&
              c.daysSinceLastOrder <= 60 &&
              c.daysSinceLastOrder >= 0
          )
          .map((c) => c.id);

      case 'reactivation':
        // Inactive / at risk
        return list.filter((c) => c.daysSinceLastOrder > 60).map((c) => c.id);

      case 'upsell':
        // High-value (LTV or AOV)
        return list
          .filter((c) => c.totalSpent > 100 || c.averageOrderValue > 50)
          .map((c) => c.id);

      case 'acquisition':
        // Never purchased or very cold
        return list
          .filter((c) => c.totalOrders === 0 || c.daysSinceLastOrder > 365)
          .map((c) => c.id);

      default:
        return [];
    }
  };

  const toggleCustomerSelection = (customerId) => {
    setSelectedCustomers((prev) =>
      prev.includes(customerId)
        ? prev.filter((id) => id !== customerId)
        : [...prev, customerId]
    );
  };

  const selectAllInactive = () => {
    const inactive = customers
      .filter((c) => c.daysSinceLastOrder > 60)
      .map((c) => c.id);
    setSelectedCustomers(inactive);
  };

  const selectAllHighValue = () => {
    const highValue = customers
      .filter((c) => c.totalSpent > 100)
      .map((c) => c.id);
    setSelectedCustomers(highValue);
  };

  /* ----------------------------------------------------
   * Backend wiring
   * ---------------------------------------------------- */

  // 0) Test backend connection and surface missing env vars
  const testBackendConnection = async () => {
    setHealthLoading(true);
    setHealthStatus(null);
    setStatus('Testing backend connection…');

    try {
      const resp = await fetch(`${API_BASE}/health`);
      let json = null;

      try {
        json = await resp.json();
      } catch {
        json = null;
      }

      let missingEnv = [];

      // Support either `missingEnv: []` or `env: { VAR: true/false }`
      if (Array.isArray(json?.missingEnv)) {
        missingEnv = json.missingEnv;
      }
      if (json?.env && typeof json.env === 'object') {
        missingEnv = missingEnv.concat(
          Object.entries(json.env)
            .filter(([, v]) => !v)
            .map(([k]) => k)
        );
      }

      const message =
        json?.message ||
        json?.status ||
        (resp.ok ? 'Backend reachable' : `HTTP ${resp.status}`);

      setHealthStatus({
        ok: resp.ok,
        message,
        missingEnv,
        raw: json,
      });

      setStatus(
        resp.ok
          ? 'Backend connection OK. See health panel for details.'
          : `Backend health check failed: ${message}`
      );
    } catch (error) {
      console.error('Health check error:', error);
      setHealthStatus({
        ok: false,
        message: error.message || 'Network error',
        missingEnv: [],
        raw: null,
      });
      setStatus(`Backend health check error: ${error.message}`);
    } finally {
      setHealthLoading(false);
    }
  };

  // 1) Fetch customers from backend (backend talks to Shopify)
  const fetchShopifyCustomers = async () => {
    setLoading(true);
    setStatus('Fetching customer data from backend (Shopify)…');

    try {
      const resp = await fetch(`${API_BASE}/api/shopify/customers`);
      const json = await resp.json();

      if (!resp.ok) {
        throw new Error(json.error || 'Failed to fetch Shopify customers');
      }

      const list = json.customers || [];
      setCustomers(list);
      setStatus(`Successfully loaded ${json.total ?? list.length} customers`);

      // Auto-select segment for current strategy
      const autoIds = autoSelectForStrategy(pricingStrategy, list);
      setSelectedCustomers(autoIds);
    } catch (error) {
      console.error('Shopify customers API error:', error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 2) Analyze with OpenAI via backend
  const analyzeWithAI = async (customerSegment) => {
    setStatus('Analyzing customer data with Dynamic Pricing AI (OpenAI)…');

    try {
      const resp = await fetch(`${API_BASE}/api/claude/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerSegment,
          pricingStrategy,
          strategyInfo: pricingStrategies[pricingStrategy],
        }),
      });

      const json = await resp.json();

      if (!resp.ok) {
        throw new Error(json.error || 'AI analysis failed');
      }

      setAiAnalysis(json);
      setStatus('AI analysis complete! Review recommendations below.');
      return json;
    } catch (error) {
      console.error('AI analysis error:', error);
      setStatus(`AI Analysis Error: ${error.message}`);
      return null;
    }
  };

  const analyzeSelectedCustomers = async () => {
    const selected = customers.filter((c) => selectedCustomers.includes(c.id));
    if (selected.length === 0) {
      setStatus('Please select customers to analyze');
      return;
    }
    await analyzeWithAI(selected);
  };

  // 3) Create discounts + MailerLite campaign via backend
  const sendMailerLiteCampaign = async () => {
    if (!aiAnalysis || selectedCustomers.length === 0) {
      setStatus('Please analyze customers first and select recipients');
      return;
    }

    const selectedRecommendations = (aiAnalysis.customerRecommendations || []).filter(
      (rec) => selectedCustomers.includes(rec.customerId)
    );

    if (!selectedRecommendations.length) {
      setStatus('No AI recommendations match the selected customers.');
      return;
    }

    setLoading(true);
    setStatus(
      'Creating Shopify discount codes and MailerLite campaign via backend…'
    );

    try {
      // 3a) Create Shopify discount codes
      const discResp = await fetch(`${API_BASE}/api/shopify/discounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendations: selectedRecommendations }),
      });
      const discJson = await discResp.json();
      if (!discResp.ok) {
        throw new Error(
          discJson.error || 'Failed to create Shopify discount codes'
        );
      }

      // 3b) Create MailerLite group + subscribers
      const mlResp = await fetch(`${API_BASE}/api/mailerlite/campaign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recommendations: selectedRecommendations,
          campaignName,
          pricingStrategy,
        }),
      });

      const mlJson = await mlResp.json();
      if (!mlResp.ok) {
        throw new Error(mlJson.error || 'Failed to create MailerLite campaign');
      }

      setStatus(
        `✅ Campaign set up! ${
          mlJson.message || ''
        } You can now design/send emails in MailerLite.`
      );
    } catch (error) {
      console.error('MailerLite/Shopify pipeline error:', error);
      setStatus(`MailerLite / Shopify Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  /* ----------------------------------------------------
   * UI
   * ---------------------------------------------------- */

  const currentSegmentCount = selectedCustomers.length;
  const totalCustomers = customers.length;

  const hasMissingEnv =
    healthStatus &&
    Array.isArray(healthStatus.missingEnv) &&
    healthStatus.missingEnv.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-8 h-8 text-purple-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                Dynamic Pricing AI
              </h1>
              <p className="text-gray-600">
                AI-powered personalized pricing for Daily N&apos;Oats customer
                reactivation
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Backend:{' '}
            <code className="px-1 py-0.5 bg-gray-100 rounded">
              {API_BASE}
            </code>
          </p>
        </div>

        {/* Backend / Data Configuration */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
            <Target className="w-5 h-5 text-purple-600" />
            Connect Data & Run Analysis
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Shopify, MailerLite, and OpenAI keys are configured on the backend.
            Use these buttons to verify your setup and load customers.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={testBackendConnection}
              disabled={healthLoading}
              className="bg-white border border-gray-300 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed text-sm flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4" />
              {healthLoading ? 'Testing…' : 'Test Backend Connection'}
            </button>

            <button
              onClick={fetchShopifyCustomers}
              disabled={loading}
              className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
            >
              {loading ? 'Loading…' : 'Fetch Customer Data from Shopify'}
            </button>
          </div>
        </div>

        {/* Health details panel */}
        {healthStatus && (
          <div
            className={`border rounded-lg p-4 mb-6 text-sm ${
              healthStatus.ok && !hasMissingEnv
                ? 'bg-green-50 border-green-200 text-green-900'
                : 'bg-yellow-50 border-yellow-200 text-yellow-900'
            }`}
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <div>
                <div className="font-semibold mb-1">
                  {healthStatus.ok
                    ? hasMissingEnv
                      ? 'Backend reachable, but some env vars are missing'
                      : 'Backend connection successful'
                    : 'Backend health check failed'}
                </div>
                <div className="mb-1">{healthStatus.message}</div>
                {hasMissingEnv && (
                  <div className="mt-1">
                    <span className="font-semibold">
                      Missing or misconfigured env vars:
                    </span>
                    <ul className="list-disc list-inside mt-1">
                      {healthStatus.missingEnv.map((name) => (
                        <li key={name}>
                          <code>{name}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Status Messages */}
        {status && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-blue-800 text-sm">{status}</p>
          </div>
        )}

        {/* Pricing Strategy Selection */}
        {customers.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold mb-1">Select Pricing Strategy</h2>
                <p className="text-sm text-gray-600">
                  Strategy automatically pre-selects the most relevant customer
                  segment. You can fine-tune selection in the table below.
                </p>
              </div>
              <div className="text-right text-sm text-gray-500">
                <div>
                  Total customers loaded:{' '}
                  <span className="font-semibold">{totalCustomers}</span>
                </div>
                <div>
                  In current segment:{' '}
                  <span className="font-semibold">
                    {currentSegmentCount}{' '}
                    {currentSegmentCount
                      ? `(${(
                          (currentSegmentCount / (totalCustomers || 1)) *
                          100
                        ).toFixed(0)}%)`
                      : ''}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(pricingStrategies).map(([key, strategy]) => {
                const isActive = pricingStrategy === key;
                return (
                  <div
                    key={key}
                    onClick={() => {
                      setPricingStrategy(key);
                      const autoIds = autoSelectForStrategy(key);
                      setSelectedCustomers(autoIds);
                    }}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      isActive
                        ? 'border-purple-600 bg-purple-50'
                        : 'border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className={`p-2 rounded-lg ${
                          isActive
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {strategy.icon}
                      </div>
                      <div>
                        <h3 className="font-bold">{strategy.name}</h3>
                        <p className="text-xs text-gray-500">
                          Click to auto-select this segment
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">
                      {strategy.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Customer List */}
        {customers.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  Customer Data ({customers.length})
                </h2>
                <p className="text-xs text-gray-500">
                  Strategy:{' '}
                  <span className="font-semibold">
                    {pricingStrategies[pricingStrategy].name}
                  </span>{' '}
                  · Selected:{' '}
                  <span className="font-semibold">
                    {selectedCustomers.length}
                  </span>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const autoIds = autoSelectForStrategy(pricingStrategy);
                    setSelectedCustomers(autoIds);
                  }}
                  className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded hover:bg-purple-200"
                >
                  Auto-select for strategy
                </button>
                <button
                  onClick={selectAllInactive}
                  className="text-sm bg-orange-100 text-orange-700 px-3 py-1 rounded hover:bg-orange-200"
                >
                  Inactive (60+ days)
                </button>
                <button
                  onClick={selectAllHighValue}
                  className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded hover:bg-green-200"
                >
                  High-Value ($100+)
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">
                      <input
                        type="checkbox"
                        checked={
                          selectedCustomers.length > 0 &&
                          selectedCustomers.length === customers.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCustomers(customers.map((c) => c.id));
                          } else {
                            setSelectedCustomers([]);
                          }
                        }}
                        className="w-4 h-4"
                      />
                    </th>
                    <th className="px-4 py-2 text-left">Customer</th>
                    <th className="px-4 py-2 text-left">Orders</th>
                    <th className="px-4 py-2 text-left">Total Spent</th>
                    <th className="px-4 py-2 text-left">AOV</th>
                    <th className="px-4 py-2 text-left">Days Since Order</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr
                      key={customer.id}
                      className="border-b hover:bg-gray-50 transition-colors"
                    >
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
                          <div className="font-medium">
                            {customer.firstName} {customer.lastName}
                          </div>
                          <div className="text-xs text-gray-500">
                            {customer.email}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2">{customer.totalOrders}</td>
                      <td className="px-4 py-2">
                        ${customer.totalSpent.toFixed(2)}
                      </td>
                      <td className="px-4 py-2">
                        ${customer.averageOrderValue.toFixed(2)}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={
                            customer.daysSinceLastOrder > 60
                              ? 'text-red-600 font-medium'
                              : ''
                          }
                        >
                          {customer.daysSinceLastOrder > 999
                            ? 'Never'
                            : `${customer.daysSinceLastOrder} days`}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {customer.daysSinceLastOrder > 90 ? (
                          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                            Inactive
                          </span>
                        ) : customer.daysSinceLastOrder > 60 ? (
                          <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">
                            At Risk
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                            Active
                          </span>
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
                Analyze {selectedCustomers.length} Selected Customer
                {selectedCustomers.length !== 1 ? 's' : ''} with AI
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
                  <div className="text-2xl font-bold text-purple-600">
                    {aiAnalysis.campaignProjection.expectedConversionRate}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Projected Revenue</div>
                  <div className="text-2xl font-bold text-green-600">
                    {aiAnalysis.campaignProjection.projectedRevenue}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Expected ROI</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {aiAnalysis.campaignProjection.projectedROI}
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg">
                <h4 className="font-bold mb-2">Strategic Insights</h4>
                <ul className="space-y-1">
                  {aiAnalysis.strategicInsights.map((insight, idx) => (
                    <li key={idx} className="text-sm text-gray-700">
                      • {insight}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Individual Recommendations */}
            <h3 className="font-bold text-lg mb-3">
              Individual Customer Recommendations
            </h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {aiAnalysis.customerRecommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className="border rounded-lg p-4 hover:bg-gray-50"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-medium">{rec.email}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        {rec.messagingAngle}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-purple-600">
                        {rec.discountPercent}% OFF
                      </div>
                      <div className="text-sm text-gray-600">
                        Code: {rec.discountCode}
                      </div>
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
                <label className="block text-sm font-medium mb-1">
                  Campaign Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., Win-Back November 2024"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>

              <button
                onClick={sendMailerLiteCampaign}
                disabled={loading || selectedCustomers.length === 0}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Mail className="w-5 h-5" />
                Create MailerLite Campaign ({selectedCustomers.length} recipients)
              </button>

              <p className="text-sm text-gray-600 mt-2">
                This will create Shopify discount codes and a MailerLite group
                with tagged subscribers. You can design and send the final email
                from your MailerLite dashboard.
              </p>
            </div>
          </div>
        )}

        {/* Instructions when no data yet */}
        {customers.length === 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4">Getting Started</h2>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <h3 className="font-bold">Configure Backend Secrets</h3>
                  <p className="text-sm text-gray-600">
                    On your Node/Render backend, set{' '}
                    <code>SHOPIFY_STORE</code>, <code>SHOPIFY_API_KEY</code>,{' '}
                    <code>MAILERLITE_API_KEY</code>, and{' '}
                    <code>OPENAI_API_KEY</code>. Then use &quot;Test Backend
                    Connection&quot; above.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold">
                  2
                </div>
                <div>
                  <h3 className="font-bold">Load Customer Data</h3>
                  <p className="text-sm text-gray-600">
                    Click &quot;Fetch Customer Data from Shopify&quot; to pull
                    up to 50 customers with order history into this dashboard.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold">
                  3
                </div>
                <div>
                  <h3 className="font-bold">Pick a Strategy</h3>
                  <p className="text-sm text-gray-600">
                    Choose between Retention, Win-Back, Upsell, or Acquisition.
                    The app will auto-select a relevant customer segment.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold">
                  4
                </div>
                <div>
                  <h3 className="font-bold">Run AI & Launch</h3>
                  <p className="text-sm text-gray-600">
                    Let OpenAI generate discount recommendations, then create
                    Shopify codes and a MailerLite campaign group in one click.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DynamicPricingAI;