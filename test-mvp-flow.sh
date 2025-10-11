#!/bin/bash
# CalorieCam MVP Flow Test
# Tests: Auth → Photo Upload → Analysis → History

set -e

API_URL=${API_URL:-http://localhost:3000/v1}
EMAIL="mvp-test-$(date +%s)@example.com"
PHOTO=${1:-apps/api/test/fixtures/meal1.jpg}

echo "========================================="
echo "CalorieCam MVP Flow Test"
echo "========================================="
echo "API: $API_URL"
echo "Email: $EMAIL"
echo "Photo: $PHOTO"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. AUTH
echo -e "${BLUE}[1/4] Authentication...${NC}"
echo "  → Requesting magic link..."
curl -X POST "$API_URL/auth/request-magic" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\"}" \
  -s > /dev/null

echo "  → Getting magic token..."
TOKEN=$(curl -s "$API_URL/auth/_debug/latest-magic?email=$EMAIL" | jq -r .t)
if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Failed to get magic token"
  exit 1
fi

echo "  → Exchanging for access token..."
AUTH_RESPONSE=$(curl -X POST "$API_URL/auth/magic-exchange" \
  -H "Content-Type: application/json" \
  -d "{\"t\":\"$TOKEN\"}" \
  -s)

ACCESS=$(echo $AUTH_RESPONSE | jq -r .access)
if [ "$ACCESS" == "null" ] || [ -z "$ACCESS" ]; then
  echo "❌ Failed to get access token"
  echo "Response: $AUTH_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Auth complete${NC}"
echo ""

# 2. ANALYZE PHOTO
echo -e "${BLUE}[2/4] Analyzing photo...${NC}"
if [ ! -f "$PHOTO" ]; then
  echo "❌ Photo not found: $PHOTO"
  exit 1
fi

ANALYZE_RESPONSE=$(curl -X POST "$API_URL/food/analyze" \
  -H "Authorization: Bearer $ACCESS" \
  -F "file=@$PHOTO" \
  -s)

MEAL_ID=$(echo $ANALYZE_RESPONSE | jq -r .mealId)
STATUS=$(echo $ANALYZE_RESPONSE | jq -r .status)
ITEMS=$(echo $ANALYZE_RESPONSE | jq -c '.items')

if [ "$MEAL_ID" == "null" ] || [ -z "$MEAL_ID" ]; then
  echo "❌ Analysis failed"
  echo "Response: $ANALYZE_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Analysis complete${NC}"
echo "  Meal ID: $MEAL_ID"
echo "  Status: $STATUS"
echo "  Items:"
echo "$ANALYZE_RESPONSE" | jq -r '.items[] | "    - \(.label): \(.kcal // 0) kcal, \(.gramsMean // 0)g"'
echo ""

# 3. VERIFY SAVED IN DB
echo -e "${BLUE}[3/4] Verifying meal in database...${NC}"
MEAL_RESPONSE=$(curl -X GET "$API_URL/meals/$MEAL_ID" \
  -H "Authorization: Bearer $ACCESS" \
  -s)

DB_STATUS=$(echo $MEAL_RESPONSE | jq -r .status)
DB_KCAL=$(echo $MEAL_RESPONSE | jq -r '.kcal // 0')
DB_ITEMS_COUNT=$(echo $MEAL_RESPONSE | jq '.items | length')

if [ "$DB_STATUS" == "null" ]; then
  echo "❌ Meal not found in database"
  echo "Response: $MEAL_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Meal saved in database${NC}"
echo "  Status: $DB_STATUS"
echo "  Total kcal: $DB_KCAL"
echo "  Items count: $DB_ITEMS_COUNT"
echo ""

# 4. GET HISTORY
echo -e "${BLUE}[4/4] Fetching meal history...${NC}"
HISTORY_RESPONSE=$(curl -X GET "$API_URL/meals?take=5" \
  -H "Authorization: Bearer $ACCESS" \
  -s)

HISTORY_COUNT=$(echo $HISTORY_RESPONSE | jq 'length')

if [ "$HISTORY_COUNT" == "null" ]; then
  echo "❌ Failed to fetch history"
  echo "Response: $HISTORY_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ History retrieved${NC}"
echo "  Total meals: $HISTORY_COUNT"
echo "  Recent meals:"
echo "$HISTORY_RESPONSE" | jq -r '.[] | "    - \(.id): \(.status), \(.kcal // 0) kcal, \(.createdAt | split("T")[0])"' | head -5
echo ""

# 5. STATS
echo -e "${BLUE}[Bonus] Daily stats...${NC}"
TODAY=$(date +%Y-%m-%d)
STATS_RESPONSE=$(curl -X GET "$API_URL/stats/daily?date=$TODAY" \
  -H "Authorization: Bearer $ACCESS" \
  -s)

TOTAL_KCAL=$(echo $STATS_RESPONSE | jq -r '.totals.kcal // 0')
TOTAL_PROTEIN=$(echo $STATS_RESPONSE | jq -r '.totals.protein // 0')
TOTAL_FAT=$(echo $STATS_RESPONSE | jq -r '.totals.fat // 0')
TOTAL_CARBS=$(echo $STATS_RESPONSE | jq -r '.totals.carbs // 0')

echo -e "${GREEN}✓ Stats for $TODAY${NC}"
echo "  Kcal: $TOTAL_KCAL"
echo "  Protein: ${TOTAL_PROTEIN}g"
echo "  Fat: ${TOTAL_FAT}g"
echo "  Carbs: ${TOTAL_CARBS}g"
echo ""

echo "========================================="
echo -e "${GREEN}✅ MVP FLOW COMPLETE${NC}"
echo "========================================="
echo ""
echo "Summary:"
echo "  ✓ Authentication (magic link)"
echo "  ✓ Photo analysis ($MEAL_ID)"
echo "  ✓ Database persistence"
echo "  ✓ History retrieval"
echo "  ✓ Daily stats"
echo ""
echo "Full flow: Photo → Analysis → Save → History ✅"

