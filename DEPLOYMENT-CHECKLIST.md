# Dynamic Pricing AI - Deployment Checklist

## 📋 Pre-Deployment Checklist

### Backend Setup
- [ ] Created backend folder
- [ ] Copied `server.js` to backend folder
- [ ] Copied `package.json` to backend folder
- [ ] Copied `.env.example` to backend folder
- [ ] Created `.env` file from `.env.example`
- [ ] Added Shopify store name to `.env`
- [ ] Added Shopify API key to `.env`
- [ ] Added MailerLite API key to `.env`
- [ ] Ran `npm install`
- [ ] Ran `npm start` successfully
- [ ] Server shows "Backend running on port 3001"
- [ ] All API keys verified as configured

### API Keys Configuration
- [ ] Shopify API key has correct permissions:
  - [ ] `read_customers`
  - [ ] `read_orders`
  - [ ] `write_price_rules`
  - [ ] `write_discounts`
- [ ] MailerLite API key is active and valid
- [ ] Tested Shopify API connection
- [ ] Tested MailerLite API connection

### Frontend Setup
- [ ] Opened `dynamic-pricing-ai-frontend.jsx` in browser
- [ ] Backend URL set to correct address (default: `http://localhost:3001`)
- [ ] Clicked "Test Connection"
- [ ] Backend shows as connected (green status)

---

## ✅ Testing Checklist

### Basic Functionality Tests
- [ ] Backend health check returns status "ok"
- [ ] Can fetch customer data from Shopify
- [ ] Customer data displays correctly in table
- [ ] Can select individual customers
- [ ] Quick-select buttons work (Inactive, High-Value)
- [ ] Pricing strategy selection works

### AI Analysis Tests
- [ ] Selected customers for analysis
- [ ] AI analysis completes without errors
- [ ] Recommendations display correctly
- [ ] Discount percentages are reasonable (0-40%)
- [ ] Discount codes are generated
- [ ] Messaging angles are personalized
- [ ] Campaign projections show

### Campaign Creation Tests
- [ ] Discount codes created in Shopify successfully
- [ ] Can verify codes in Shopify Admin → Discounts
- [ ] Codes have 7-day expiration set
- [ ] Codes have one-time use limit
- [ ] MailerLite campaign created
- [ ] Subscribers added to MailerLite group
- [ ] Custom fields populated correctly
- [ ] Campaign shows in MailerLite dashboard

### End-to-End Test
- [ ] Select 1-2 test customers
- [ ] Run AI analysis
- [ ] Create campaign
- [ ] Verify discount codes in Shopify
- [ ] Verify campaign in MailerLite
- [ ] Send test email to yourself
- [ ] Test discount code at checkout

---

## 🚀 Production Deployment Checklist

### Local Development (Current Setup)
- [ ] Backend running on `localhost:3001`
- [ ] Frontend connecting successfully
- [ ] All features tested and working

### Deploy to Heroku (Recommended)
- [ ] Heroku CLI installed
- [ ] Logged into Heroku (`heroku login`)
- [ ] Created Heroku app
- [ ] Set environment variables in Heroku:
  - [ ] `SHOPIFY_STORE`
  - [ ] `SHOPIFY_API_KEY`
  - [ ] `MAILERLITE_API_KEY`
  - [ ] `PORT` (Heroku sets this automatically)
- [ ] Pushed code to Heroku
- [ ] Verified deployment
- [ ] Updated frontend `backendUrl` to Heroku URL
- [ ] Tested production connection

### Alternative: Deploy to Vercel
- [ ] Vercel CLI installed
- [ ] Project deployed to Vercel
- [ ] Environment variables configured
- [ ] API routes working
- [ ] Updated frontend URL

### Alternative: Deploy to Railway.app
- [ ] Connected GitHub repo to Railway
- [ ] Environment variables added
- [ ] Deployment successful
- [ ] Service URL obtained
- [ ] Frontend updated

---

## 🔒 Security Checklist

- [ ] `.env` file is in `.gitignore`
- [ ] Never committed API keys to git
- [ ] Production uses HTTPS
- [ ] Environment variables stored securely
- [ ] API keys have minimum required permissions
- [ ] Regular API key rotation scheduled
- [ ] Access logs monitored

---

## 📊 Post-Launch Checklist

### First Campaign
- [ ] Selected customer segment identified
- [ ] Pricing strategy chosen
- [ ] AI recommendations reviewed
- [ ] Discount codes created
- [ ] Email campaign prepared
- [ ] Test email sent and reviewed
- [ ] Campaign sent to customers

### Monitoring
- [ ] Watching for customer responses
- [ ] Monitoring discount code usage in Shopify
- [ ] Tracking email open rates in MailerLite
- [ ] Recording conversion rates
- [ ] Calculating actual ROI
- [ ] Comparing to AI projections

### Optimization
- [ ] Analyzing campaign results
- [ ] Identifying what worked well
- [ ] Noting what could improve
- [ ] Planning next campaign iteration
- [ ] Documenting learnings

---

## 🎯 Success Metrics to Track

### Customer Reactivation
- [ ] Number of inactive customers targeted: _______
- [ ] Email open rate: _______%
- [ ] Email click rate: _______%
- [ ] Discount code usage rate: _______%
- [ ] Reactivation rate: _______%
- [ ] Average order value from campaign: $_______
- [ ] Total revenue generated: $_______
- [ ] Campaign cost: $_______
- [ ] Actual ROI: _______x

### Business Impact
- [ ] Active customer count before: _______
- [ ] Active customer count after: _______
- [ ] Monthly revenue before: $_______
- [ ] Monthly revenue after: $_______
- [ ] Overall ROAS improvement: _______

---

## 🔄 Maintenance Checklist

### Weekly
- [ ] Check backend server status
- [ ] Review campaign performance
- [ ] Monitor API usage limits
- [ ] Check error logs

### Monthly
- [ ] Review and rotate API keys
- [ ] Update dependencies (`npm update`)
- [ ] Analyze aggregate campaign results
- [ ] Plan next month's campaigns
- [ ] Review and optimize pricing strategies

### Quarterly
- [ ] Full system audit
- [ ] Performance optimization review
- [ ] Cost analysis
- [ ] Feature enhancement planning

---

## 🆘 Emergency Contacts & Resources

### API Support
- **Shopify Support**: https://help.shopify.com
- **MailerLite Support**: https://www.mailerlite.com/contact
- **Anthropic Support**: https://support.anthropic.com

### Documentation
- **Backend Setup**: `BACKEND-SETUP-GUIDE.md`
- **Quick Start**: `README.md`
- **Original Guide**: `SETUP-GUIDE.md`

### Troubleshooting
1. Check backend logs first
2. Verify API keys in `.env`
3. Test each API endpoint individually
4. Review Shopify/MailerLite dashboards for errors
5. Consult documentation files

---

## ✨ You're Ready When...

All items above are checked, and you can:
- ✅ Start backend server without errors
- ✅ Connect frontend to backend
- ✅ Fetch customer data
- ✅ Run AI analysis
- ✅ Create discount codes in Shopify
- ✅ Launch MailerLite campaigns
- ✅ See campaigns in MailerLite dashboard
- ✅ Test discount codes at checkout

**Target: Turn 200 active customers → 2,000+ active customers!** 🚀

Good luck with your customer reactivation campaign! 💪
