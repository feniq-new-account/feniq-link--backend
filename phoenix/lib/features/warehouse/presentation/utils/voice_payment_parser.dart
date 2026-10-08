// Recording a payment by voice, with no AI: the phone turns speech into text,
// and these plain rules read the text - a pharmacy name, who paid, how much,
// how much is left.
//
// The web panel has the same rules in web/src/utils/voicePayment.js. Both are
// tested against tools/voice-payment/cases.json, so they cannot drift apart.

const _western = '0123456789';
const _arabicIndic = '٠١٢٣٤٥٦٧٨٩';
const _persianIndic = '۰۱۲۳۴۵۶۷۸۹';

/// Lower-case, digits to Western, diacritics and tatweel out, alef/yeh/heh
/// variants folded, anything else that isn't a letter, digit or a decimal dot
/// turned into a space.
String normalizeSpeech(String? text) {
  var s = (text ?? '').split('').map((c) {
    var i = _arabicIndic.indexOf(c);
    if (i < 0) i = _persianIndic.indexOf(c);
    return i >= 0 ? _western[i] : c;
  }).join();
  s = s.replaceAllMapped(RegExp(r'(\d)[,،٬](?=\d{3})'), (m) => m[1]!);
  s = s.replaceAll(RegExp('[ً-ٰٟـ]'), '');
  s = s
      .replaceAll(RegExp('[أإآٱ]'), 'ا')
      .replaceAll('ى', 'ي')
      .replaceAll('ة', 'ه')
      .replaceAll('ئ', 'ي')
      .replaceAll('ؤ', 'و')
      .toLowerCase();
  s = s.replaceAll(RegExp(r'(?<!\d)\.|\.(?!\d)'), ' ');
  s = s.replaceAll(RegExp('[^ء-يa-z0-9. ]'), ' ');
  return s.replaceAll(RegExp(r'\s+'), ' ').trim();
}

const Map<String, int> _units = {
  'واحد': 1, 'وحده': 1, 'اثنين': 2, 'اتنين': 2, 'تنتين': 2, 'ثنتين': 2, 'اثنان': 2,
  'ثلاثه': 3, 'تلاته': 3, 'ثلاث': 3, 'تلات': 3, 'اربعه': 4, 'اربع': 4, 'خمسه': 5, 'خمس': 5,
  'سته': 6, 'ست': 6, 'سبعه': 7, 'سبع': 7, 'ثمانيه': 8, 'تمانيه': 8, 'ثماني': 8, 'تماني': 8, 'تمن': 8,
  'تسعه': 9, 'تسع': 9, 'عشره': 10, 'عشر': 10,
  'احدعش': 11, 'اطنعش': 12, 'اثنعش': 12, 'طنعش': 12, 'تلطعش': 13, 'تلتعش': 13, 'ثلاثعش': 13,
  'اربعتعش': 14, 'خمستعش': 15, 'ستعش': 16, 'سبعتعش': 17, 'تمنتعش': 18, 'تسعتعش': 19,
  'عشرين': 20, 'ثلاثين': 30, 'تلاتين': 30, 'اربعين': 40, 'خمسين': 50, 'ستين': 60, 'سبعين': 70,
  'ثمانين': 80, 'تمانين': 80, 'تسعين': 90,
  'ميه': 100, 'مايه': 100, 'ميتين': 200, 'ميتان': 200,
  'ثلاثميه': 300, 'تلتميه': 300, 'تلاتميه': 300, 'اربعميه': 400, 'ربعميه': 400, 'خمسميه': 500,
  'ستميه': 600, 'سبعميه': 700, 'ثمانميه': 800, 'تمانميه': 800, 'تسعميه': 900,
};
const _thousand = {'الف'};
const _thousandDual = {'الفين', 'الفان'};
const _thousandPlural = {'الاف', 'تلاف'};
const _million = {'مليون'};
const _millionDual = {'مليونين', 'مليونان'};
const _millionPlural = {'ملايين'};
const _half = {'نص', 'نصف'};
const _quarter = {'ربع'};

const _paid = {
  'دفع', 'دفعت', 'دفعو', 'دفعوا', 'دفعنا', 'دفعلنا', 'ندفع', 'يدفع',
  'سدد', 'سددت', 'سددو', 'سددوا', 'سددنا', 'تسدد', 'يسدد',
  'جاب', 'جابت', 'جابو', 'جابوا', 'جبنا',
  'اعطي', 'اعطت', 'اعطو', 'اعطوا', 'اعطانا', 'اعطتنا',
  'قبضت', 'قبضنا', 'استلمت', 'استلمنا', 'استلم', 'سلم', 'سلمت', 'سلمو', 'سلموا',
  'حول', 'حولت', 'حولو', 'حولوا', 'نزل', 'نزلت', 'نزلو', 'نزلوا',
};
const _fullVerbs = {
  'سدد', 'سددت', 'سددو', 'سددوا', 'سددنا', 'تسدد', 'يسدد',
  'خلصت', 'خلص', 'خلصو', 'خلصوا', 'صفت', 'صفيت', 'صفي',
};
const _fullWords = {'كامل', 'كامله', 'كاملا', 'كلو', 'كله', 'كلها', 'كلهم', 'تماما', 'بالكامل', 'الكل'};
const _left = {'ضل', 'ظل', 'بقي', 'بقيت', 'باقي', 'الباقي', 'بيضل', 'ضلت', 'بضل', 'يبقي', 'بيبقي'};
const _fillers = {
  'و', 'من', 'الي', 'ال', 'لل', 'ل', 'س', 'في', 'علي', 'عن', 'ب', 'كل', 'يعني', 'هلق', 'اليوم', 'لسا', 'بس',
  'علينا', 'عليها', 'عليهم', 'عليه', 'عندنا', 'عندها', 'عندهم', 'المبلغ', 'مبلغ', 'دفعه', 'دفعات', 'الدفعه',
  'حساب', 'الحساب', 'نقدا', 'نقد', 'كاش', 'ليره', 'ليرات', 'سوري', 'سوريه', 'جديده',
  'سجل', 'سجلي', 'سجلو', 'تسجيل', 'اضف', 'ضيف',
};
const _titles = {
  'صيدليه', 'الصيدليه', 'صيدلي', 'الصيدلي', 'دكتور', 'الدكتور', 'دكتوره', 'الدكتوره', 'د', 'مركز', 'المركز',
};

bool _isNumeric(String t) => RegExp(r'^\d+(\.\d+)?$').hasMatch(t);
bool _isMultiplier(String t) =>
    _thousand.contains(t) ||
    _thousandDual.contains(t) ||
    _thousandPlural.contains(t) ||
    _million.contains(t) ||
    _millionDual.contains(t) ||
    _millionPlural.contains(t);
bool _isNumberWord(String t) =>
    _units.containsKey(t) || _isMultiplier(t) || _half.contains(t) || _quarter.contains(t);
bool _isNumberLike(String t) => _isNumeric(t) || _isNumberWord(t);
bool _isKnownWord(String t) =>
    _isNumberLike(t) ||
    _paid.contains(t) ||
    _left.contains(t) ||
    _fullWords.contains(t) ||
    _fillers.contains(t) ||
    _titles.contains(t);

String _stripConnector(String token, bool Function(String) isKnown) {
  if (token.length > 1 && token.startsWith('و') && !isKnown(token) && isKnown(token.substring(1))) {
    return token.substring(1);
  }
  return token;
}

class _NumberRead {
  const _NumberRead(this.value, this.end);
  final int value;
  final int end;
}

_NumberRead? _readNumber(List<String> tokens, int start) {
  double total = 0;
  double current = 0;
  double lastMultiplier = 0;
  var i = start;
  var any = false;
  while (i < tokens.length) {
    var t = tokens[i];
    if (t == 'و') {
      final next = i + 1 < tokens.length ? tokens[i + 1] : null;
      if (any && next != null && _isNumberLike(next)) {
        i += 1;
        continue;
      }
      break;
    }
    t = _stripConnector(t, _isNumberLike);
    if (!_isNumberLike(t)) break;
    final next = _stripConnector(i + 1 < tokens.length ? tokens[i + 1] : '', _isNumberLike);
    if (_isNumeric(t)) {
      current += double.parse(t);
    } else if (_units.containsKey(t)) {
      current += _units[t]!;
    } else if (_half.contains(t) || _quarter.contains(t)) {
      final fraction = _half.contains(t) ? 0.5 : 0.25;
      if (_isMultiplier(next)) {
        final unit = _million.contains(next) ? 1e6 : 1000.0;
        total += fraction * unit;
        lastMultiplier = unit;
        i += 1;
      } else if (lastMultiplier != 0) {
        total += fraction * lastMultiplier;
      } else {
        break;
      }
    } else if (_thousand.contains(t) || _thousandPlural.contains(t)) {
      total += (current == 0 ? 1 : current) * 1000;
      current = 0;
      lastMultiplier = 1000;
    } else if (_thousandDual.contains(t)) {
      total += 2000;
      current = 0;
      lastMultiplier = 1000;
    } else if (_million.contains(t) || _millionPlural.contains(t)) {
      total += (current == 0 ? 1 : current) * 1e6;
      current = 0;
      lastMultiplier = 1e6;
    } else if (_millionDual.contains(t)) {
      total += 2e6;
      current = 0;
      lastMultiplier = 1e6;
    }
    any = true;
    i += 1;
  }
  if (!any) return null;
  return _NumberRead((total + current).round(), i);
}

/// What the sentence said. [kind] is `amount` (a sum was said), `left` (only
/// what is left), `full`, or `unknown`; [name] is the pharmacy words
/// (normalised) or null.
class VoicePayment {
  const VoicePayment({this.name, required this.kind, this.paid, this.left});

  final String? name;
  final String kind;
  final int? paid;
  final int? left;
}

VoicePayment parseVoicePayment(String? text) {
  final tokens = normalizeSpeech(text).split(' ').where((t) => t.isNotEmpty).toList();
  final nameTokens = <String>[];
  int? paid;
  int? left;
  var afterLeft = false;
  var full = false;
  var i = 0;
  while (i < tokens.length) {
    final raw = tokens[i];
    final t = _stripConnector(raw, _isKnownWord);
    final startsNumber = _isNumberLike(t) || (raw == 'و' && i + 1 < tokens.length && _isNumberLike(tokens[i + 1]));
    final number = startsNumber ? _readNumber(tokens, i) : null;
    if (number != null && number.value > 0) {
      if (afterLeft && left == null) {
        left = number.value;
      } else {
        paid ??= number.value;
      }
      i = number.end;
      continue;
    }
    if (_left.contains(t)) {
      afterLeft = true;
    } else if (_fullWords.contains(t) || _fullVerbs.contains(t)) {
      full = true;
    } else if (!_paid.contains(t) && !_fillers.contains(t) && !_titles.contains(t) && !_isNumberLike(t)) {
      nameTokens.add(raw);
    }
    i += 1;
  }
  final kind = paid != null ? 'amount' : (left != null ? 'left' : (full ? 'full' : 'unknown'));
  return VoicePayment(name: nameTokens.isEmpty ? null : nameTokens.join(' '), kind: kind, paid: paid, left: left);
}

// --- matching the spoken name to a pharmacy ---------------------------------

int _levenshtein(String a, String b) {
  final row = List<int>.generate(b.length + 1, (j) => j);
  for (var i = 1; i <= a.length; i++) {
    var diagonal = row[0];
    row[0] = i;
    for (var j = 1; j <= b.length; j++) {
      final above = row[j];
      var best = row[j] + 1;
      if (row[j - 1] + 1 < best) best = row[j - 1] + 1;
      final replace = diagonal + (a[i - 1] == b[j - 1] ? 0 : 1);
      if (replace < best) best = replace;
      row[j] = best;
      diagonal = above;
    }
  }
  return row[b.length];
}

List<String> _nameWords(String? text) => normalizeSpeech(text)
    .split(' ')
    .where((w) => w.isNotEmpty && !_titles.contains(w))
    .map((w) => w.length > 3 && w.startsWith('ال') ? w.substring(2) : w)
    .toList();

double _tokenSimilarity(String a, String b) {
  if (a == b) return 1;
  final shorter = a.length < b.length ? a.length : b.length;
  final longer = a.length < b.length ? b.length : a.length;
  if (shorter >= 3) {
    final distance = _levenshtein(a, b);
    final allowed = shorter >= 4 && longer >= 6 ? 2 : 1;
    if (distance <= allowed) return 1 - distance / longer;
  }
  if (shorter >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.7;
  return 0;
}

double _scoreName(List<String> query, String nameText) {
  final words = _nameWords(nameText);
  if (query.isEmpty || words.isEmpty) return 0;
  var covered = 0.0;
  for (final q in query) {
    var best = 0.0;
    for (final w in words) {
      final s = _tokenSimilarity(q, w);
      if (s > best) best = s;
    }
    covered += best;
  }
  final extra = words.length > query.length ? words.length - query.length : 0;
  return covered / query.length - 0.05 * extra;
}

class PharmacyMatch {
  const PharmacyMatch(this.id, this.score);

  final String id;
  final double score;
}

/// The pharmacies a spoken [name] could mean, best first (at most 3).
/// [accounts] are `(id, nameAr, nameEn)`.
List<PharmacyMatch> matchPharmacies(String? name, List<({String id, String nameAr, String nameEn})> accounts) {
  final query = _nameWords(name);
  if (query.isEmpty) return const [];
  final matches = [
    for (final a in accounts)
      PharmacyMatch(
        a.id,
        () {
          final ar = _scoreName(query, a.nameAr);
          final en = _scoreName(query, a.nameEn);
          return ar > en ? ar : en;
        }(),
      ),
  ].where((m) => m.score >= 0.4).toList()..sort((a, b) => b.score.compareTo(a.score));
  return matches.take(3).toList();
}

/// What to record, given the pharmacy's balance: (paid, left) in whole liras,
/// or null when the words don't add up to a payment: nothing said, or a sum
/// above what is owed (a misheard "fifty thousand" must not become "fifty
/// million" - the card refuses it and the operator corrects the sentence).
({int paid, int left})? paymentFor(VoicePayment parsed, double balanceSyp) {
  if (parsed.kind == 'amount' && parsed.paid != null) {
    return parsed.paid! <= balanceSyp ? (paid: parsed.paid!, left: (balanceSyp - parsed.paid!).round()) : null;
  }
  if (parsed.kind == 'full' && balanceSyp > 0) return (paid: balanceSyp.round(), left: 0);
  if (parsed.kind == 'left' && parsed.left != null && balanceSyp > parsed.left!) {
    return (paid: (balanceSyp - parsed.left!).round(), left: parsed.left!);
  }
  return null;
}
