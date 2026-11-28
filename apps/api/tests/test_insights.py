import unittest
from datetime import date, datetime

from app.insights import JournalStats, as_utc_boundary, period_bounds


def card(entry):
    return {"type": "dailyJournal", "attrs": {"entry": entry}}


class JournalStatsTests(unittest.TestCase):
    def test_calendar_periods_use_local_dates_and_exclusive_end(self):
        self.assertEqual(period_bounds("week", date(2026, 1, 1)), (date(2025, 12, 29), date(2026, 1, 5)))
        self.assertEqual(period_bounds("month", date(2028, 2, 29)), (date(2028, 2, 1), date(2028, 3, 1)))
        self.assertEqual(period_bounds("quarter", date(2026, 12, 15)), (date(2026, 10, 1), date(2027, 1, 1)))
        self.assertEqual(as_utc_boundary(date(2026, 1, 1)), datetime(2025, 12, 31, 16))

    def test_combines_old_and_new_cards_without_mixing_sleep_scales(self):
        stats = JournalStats("month", date(2026, 11, 1), date(2026, 12, 1))
        stats.add_document({"type": "doc", "content": [
            card({
                "date": "2026-11-28",
                "meals": [{"name": "breakfast", "food": " 燕麦 ", "place": "楼下小店", "amount": 0.10},
                          {"name": "lunch", "food": "米饭", "amount": 0}],
                "otherExpenses": [{"description": "公交", "amount": 0.20}],
                "sleepQuality": 83.5, "moodScore": 4, "bristolType": 4,
            }),
            {"type": "blockquote", "content": [card({
                "date": "2026-11-28", "breakfast": "燕麦", "expenseAmount": 2,
                "expenseNote": "公交", "sleepScore": 3, "moodScore": 2, "bristolType": 5,
            })]},
            card({"date": "2026-12-01", "breakfast": "不在时段内"}),
        ]})
        result = stats.summary()
        self.assertEqual((result["recorded_days"], result["journal_entries"]), (1, 2))
        self.assertEqual(result["expenses"]["total"], 2.30)
        self.assertEqual(result["expenses"]["count"], 4)
        self.assertEqual(result["expenses"]["uses"], [{"label": "公交", "total": 2.20, "count": 2}])
        self.assertEqual(result["meals"][0]["foods"], [{"label": "燕麦", "count": 2}])
        self.assertEqual(result["meals"][0]["places"], [{"label": "楼下小店", "count": 1}])
        self.assertEqual(result["mood"]["average"], 3)
        self.assertEqual(result["bristol"]["count"], 2)
        self.assertEqual(result["sleep"]["quality"]["average"], 83.5)
        self.assertEqual(result["sleep"]["legacy_quality"]["average"], 3)

    def test_year_groups_by_month_and_uses_original_timestamp_for_notes(self):
        stats = JournalStats("year", date(2026, 1, 1), date(2027, 1, 1))
        stats.add_document({"type": "doc", "content": [
            {"type": "paragraph", "attrs": {"journalTime": "2025-12-31T16:01:00Z",
                                           "journalUpdatedAt": "2026-02-01T00:00:00Z"}},
            {"type": "heading", "attrs": {"journalTime": "2025-12-31T15:59:59Z"}},
            card({"date": "2026-02-06", "meals": [], "sleepQuality": None}),
        ]})
        stats.add_expense(date(2026, 1, 1), "9.99", "交通", "地铁")
        result = stats.summary()
        self.assertEqual(result["quick_notes"], 1)
        self.assertEqual(result["recorded_days"], 2)
        self.assertEqual([row["date"] for row in result["trend"]], [date(2026, 1, 1), date(2026, 2, 1)])
        self.assertEqual(result["trend"][0]["expense_total"], 9.99)
        self.assertIsNone(result["trend"][0]["sleep_quality"])

    def test_empty_range_keeps_zero_amount_and_missing_averages(self):
        stats = JournalStats("week", date(2026, 11, 23), date(2026, 11, 30))
        result = stats.summary()
        self.assertEqual(result["recorded_days"], 0)
        self.assertEqual(result["expenses"]["total"], 0)
        self.assertIsNone(result["mood"]["average"])
        self.assertEqual(result["trend"], [])


if __name__ == "__main__":
    unittest.main()
