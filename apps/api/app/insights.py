from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from math import isfinite
from typing import Literal

Period = Literal["day", "week", "month", "quarter", "year"]
JOURNAL_ZONE = timezone(timedelta(hours=8))
MEALS = ("breakfast", "lunch", "dinner")


def period_bounds(period: Period, anchor: date) -> tuple[date, date]:
    """Return the inclusive start and exclusive end in the journal's calendar."""
    if period == "day":
        return anchor, anchor + timedelta(days=1)
    if period == "week":
        start = anchor - timedelta(days=anchor.weekday())
        return start, start + timedelta(days=7)
    if period == "year":
        return date(anchor.year, 1, 1), date(anchor.year + 1, 1, 1)
    months = 3 if period == "quarter" else 1
    start_month = (anchor.month - 1) // months * months + 1
    end_month = start_month - 1 + months
    return date(anchor.year, start_month, 1), date(anchor.year + end_month // 12, end_month % 12 + 1, 1)


def as_utc_boundary(day: date) -> datetime:
    # The database stores legacy timestamps in UTC without a timezone.
    return datetime.combine(day, time.min, JOURNAL_ZONE).astimezone(timezone.utc).replace(tzinfo=None)


def local_day(stamp: datetime) -> date:
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(JOURNAL_ZONE).date()


def parsed_date(value) -> date | None:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def stamped_day(value) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        return local_day(datetime.fromisoformat(value.replace("Z", "+00:00")))
    except (OverflowError, ValueError):
        return None


def label(value) -> str:
    return " ".join(value.split()) if isinstance(value, str) else ""


def amount_cents(value) -> int | None:
    try:
        amount = Decimal(str(value))
    except InvalidOperation:
        return None
    if not amount.is_finite() or not 0 <= amount <= Decimal("9999999999.99"):
        return None
    return int((amount * 100).to_integral_value(rounding=ROUND_HALF_UP))


def number(value) -> float | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    try:
        return float(value) if isfinite(value) else None
    except OverflowError:
        return None


def counts(counter):
    return [{"label": name, "count": count}
            for name, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))]


def distribution(counter, size):
    return [{"value": value, "count": counter[value]} for value in range(1, size + 1)]


@dataclass
class Amount:
    cents: int = 0
    count: int = 0

    def add(self, cents: int) -> None:
        self.cents += cents
        self.count += 1

    def summary(self) -> dict:
        return {"total": self.cents / 100, "count": self.count}


def amounts(groups):
    return [{"label": name, **amount.summary()}
            for name, amount in sorted(groups.items(), key=lambda item: (-item[1].cents, item[0]))]


@dataclass
class Average:
    count: int = 0
    average: float | None = None

    def add(self, value: float) -> None:
        self.count += 1
        previous = self.average or 0.0
        self.average = previous + (value - previous) / self.count

    def summary(self) -> dict:
        return {"count": self.count, "average": None if self.average is None else round(self.average, 2)}


@dataclass
class Meal:
    count: int = 0
    spending: Amount = field(default_factory=Amount)
    foods: Counter = field(default_factory=Counter)
    places: Counter = field(default_factory=Counter)


@dataclass
class Trend:
    days: set[date] = field(default_factory=set)
    spending: Amount = field(default_factory=Amount)
    mood: Average = field(default_factory=Average)
    sleep_quality: Average = field(default_factory=Average)
    meals: int = 0
    bristol: int = 0


class JournalStats:
    def __init__(self, period: Period, start: date, end: date):
        self.period = period
        self.start = start
        self.end = end
        self.days: set[date] = set()
        self.journal_entries = 0
        self.quick_notes = 0
        self.spending = Amount()
        self.categories = defaultdict(Amount)
        self.expense_uses = defaultdict(Amount)
        self.meals = {meal: Meal() for meal in MEALS}
        self.mood = Average()
        self.mood_counts = Counter()
        self.bristol_counts = Counter()
        self.sleep_quality = Average()
        self.legacy_sleep_quality = Average()
        self.trends = defaultdict(Trend)

    def includes(self, day: date | None) -> bool:
        return day is not None and self.start <= day < self.end

    def bucket(self, day: date) -> Trend:
        self.days.add(day)
        start = day.replace(day=1) if self.period in ("quarter", "year") else day
        trend = self.trends[start]
        trend.days.add(day)
        return trend

    def add_expense(self, day: date, value, category, purpose=None) -> None:
        cents = amount_cents(value)
        if cents is None:
            return
        self.bucket(day).spending.add(cents)
        self.spending.add(cents)
        self.categories[label(category) or "其他消费"].add(cents)
        if purpose is not None:
            self.expense_uses[label(purpose) or "未填写用途"].add(cents)

    def add_mood(self, day: date, value) -> None:
        score = number(value)
        if score in (1, 2, 3, 4, 5):
            self.bucket(day).mood.add(score)
            self.mood.add(score)
            self.mood_counts[int(score)] += 1

    def add_bristol(self, day: date, value) -> None:
        bristol_type = number(value)
        if bristol_type in (1, 2, 3, 4, 5, 6, 7):
            self.bucket(day).bristol += 1
            self.bristol_counts[int(bristol_type)] += 1

    def add_meal(self, day: date, name: str, food, place=None, value=None) -> None:
        food, place, cents = label(food), label(place), amount_cents(value)
        if not (food or place or cents is not None):
            return
        self.bucket(day).meals += 1
        meal = self.meals[name]
        meal.count += 1
        if food:
            meal.foods[food] += 1
        if place:
            meal.places[place] += 1
        if cents is not None:
            meal.spending.add(cents)
            self.add_expense(day, value, "餐饮")

    def add_daily_entry(self, entry) -> None:
        if not isinstance(entry, dict):
            return
        day = parsed_date(entry.get("date"))
        if day is None or not self.includes(day):
            return
        self.journal_entries += 1
        trend = self.bucket(day)
        meals = entry.get("meals")
        if isinstance(meals, list):
            for meal in meals:
                if isinstance(meal, dict) and meal.get("name") in MEALS:
                    self.add_meal(day, meal["name"], meal.get("food"), meal.get("place"), meal.get("amount"))
            other_expenses = entry.get("otherExpenses")
            if isinstance(other_expenses, list):
                for expense in other_expenses:
                    if isinstance(expense, dict):
                        self.add_expense(day, expense.get("amount"), "其他消费", expense.get("description") or "")
            quality = number(entry.get("sleepQuality"))
            if quality is not None and quality >= 0:
                self.sleep_quality.add(quality)
                trend.sleep_quality.add(quality)
        else:
            for name in MEALS:
                self.add_meal(day, name, entry.get(name))
            self.add_expense(day, entry.get("expenseAmount"), "其他消费", entry.get("expenseNote") or "")
            score = number(entry.get("sleepScore"))
            if score in (1, 2, 3, 4, 5):
                self.legacy_sleep_quality.add(score)
        self.add_mood(day, entry.get("moodScore"))
        self.add_bristol(day, entry.get("bristolType"))

    def add_document(self, content) -> None:
        # Traverse editor JSON so records in older columns or nested blocks count.
        nodes = [content]
        while nodes:
            node = nodes.pop()
            if not isinstance(node, dict):
                continue
            attrs = node.get("attrs")
            if isinstance(attrs, dict):
                if node.get("type") == "dailyJournal":
                    self.add_daily_entry(attrs.get("entry"))
                elif node.get("type") in ("paragraph", "heading") and attrs.get("journalTime"):
                    day = stamped_day(attrs["journalTime"])
                    if day is not None and self.includes(day):
                        self.bucket(day)
                        self.quick_notes += 1
            children = node.get("content")
            if isinstance(children, list):
                nodes.extend(children)

    def summary(self) -> dict:
        return {
            "period": self.period,
            "start_date": self.start,
            "end_date": self.end - timedelta(days=1),
            "recorded_days": len(self.days),
            "journal_entries": self.journal_entries,
            "quick_notes": self.quick_notes,
            "expenses": {**self.spending.summary(), "categories": amounts(self.categories),
                         "uses": amounts(self.expense_uses)},
            "meals": [{"meal": name, "count": meal.count, "spending": meal.spending.summary(),
                       "foods": counts(meal.foods), "places": counts(meal.places)}
                      for name, meal in self.meals.items()],
            "mood": {**self.mood.summary(), "distribution": distribution(self.mood_counts, 5)},
            "bristol": {"count": sum(self.bristol_counts.values()), "distribution": distribution(self.bristol_counts, 7)},
            "sleep": {"quality": self.sleep_quality.summary(), "legacy_quality": self.legacy_sleep_quality.summary()},
            "trend": [{"date": day, "recorded_days": len(trend.days),
                       "expense_total": trend.spending.summary()["total"], "meals": trend.meals,
                       "mood": trend.mood.summary()["average"], "bristol": trend.bristol,
                       "sleep_quality": trend.sleep_quality.summary()["average"]}
                      for day, trend in sorted(self.trends.items())],
        }
