class UserModel {
  const UserModel({
    required this.id,
    required this.name,
    required this.phone,
    required this.role,
    required this.status,
    required this.lang,
    this.mustChangePassword = false,
  });

  final String id;
  final String name;
  final String phone;
  final String role;
  final String status;
  final String lang;

  // Set by the server after an admin reset: the user signed in with a
  // temporary password the admin chose, and must replace it before anything
  // else (AuthCubit maps it to SessionStatus.passwordChangeRequired). A server
  // that predates the field sends nothing, which reads as false.
  final bool mustChangePassword;

  factory UserModel.fromJson(Map<String, dynamic> json) => UserModel(
    id: json['id'] as String,
    name: json['name'] as String,
    phone: json['phone'] as String,
    role: json['role'] as String,
    status: json['status'] as String,
    lang: json['lang'] as String,
    mustChangePassword: json['mustChangePassword'] == true,
  );

  bool get isPending => status == 'pending';
  bool get isBlocked => status == 'blocked';
  bool get isActive => status == 'active';
}
