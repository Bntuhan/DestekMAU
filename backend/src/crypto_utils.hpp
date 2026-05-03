#pragma once

#include <string>
#include <vector>
#include <random>
#include <sstream>
#include <iomanip>
#include <openssl/evp.h>
#include <openssl/rand.h>
#include <jwt-cpp/jwt.h>
#include <jwt-cpp/traits/nlohmann-json/traits.h>

namespace crypto {

inline std::string to_hex(const std::vector<unsigned char>& data) {
    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    for (int i : data)
        ss << std::setw(2) << i;
    return ss.str();
}

inline std::vector<unsigned char> from_hex(const std::string& hex) {
    std::vector<unsigned char> bytes;
    for (unsigned int i = 0; i < hex.length(); i += 2) {
        std::string byteString = hex.substr(i, 2);
        unsigned char byte = (unsigned char) strtol(byteString.c_str(), NULL, 16);
        bytes.push_back(byte);
    }
    return bytes;
}

// Format: salt:hash
inline std::string hash_password(const std::string& password) {
    unsigned char salt[16];
    if (RAND_bytes(salt, sizeof(salt)) != 1) return "";

    unsigned char hash[32];
    if (PKCS5_PBKDF2_HMAC(password.c_str(), password.length(),
                          salt, sizeof(salt), 10000,
                          EVP_sha256(), sizeof(hash), hash) != 1) {
        return "";
    }

    return to_hex(std::vector<unsigned char>(salt, salt + 16)) + ":" + 
           to_hex(std::vector<unsigned char>(hash, hash + 32));
}

inline bool verify_password(const std::string& password, const std::string& stored_hash) {
    auto pos = stored_hash.find(':');
    if (pos == std::string::npos) return password == stored_hash; // fallback for unhashed plain text
    
    std::string salt_hex = stored_hash.substr(0, pos);
    std::string hash_hex = stored_hash.substr(pos + 1);

    auto salt = from_hex(salt_hex);
    auto expected_hash = from_hex(hash_hex);

    unsigned char hash[32];
    if (PKCS5_PBKDF2_HMAC(password.c_str(), password.length(),
                          salt.data(), salt.size(), 10000,
                          EVP_sha256(), sizeof(hash), hash) != 1) {
        return false;
    }

    std::vector<unsigned char> actual_hash(hash, hash + 32);
    return actual_hash == expected_hash;
}

inline std::string create_jwt(int64_t user_id, const std::string& role, const std::string& secret) {
    return jwt::create<jwt::traits::nlohmann_json>()
        .set_issuer("destek_mau")
        .set_type("JWS")
        .set_payload_claim("id", jwt::basic_claim<jwt::traits::nlohmann_json>(std::to_string(user_id))) // Store id as string for safety
        .set_payload_claim("role", jwt::basic_claim<jwt::traits::nlohmann_json>(role))
        .set_issued_at(std::chrono::system_clock::now())
        .set_expires_at(std::chrono::system_clock::now() + std::chrono::hours{24})
        .sign(jwt::algorithm::hs256{secret});
}

inline std::string verify_jwt(const std::string& token, const std::string& secret) {
    try {
        auto verifier = jwt::verify<jwt::traits::nlohmann_json>()
            .allow_algorithm(jwt::algorithm::hs256{secret})
            .with_issuer("destek_mau");
        auto decoded = jwt::decode<jwt::traits::nlohmann_json>(token);
        verifier.verify(decoded);
        return decoded.get_payload_claim("id").as_string();
    } catch (...) {
        return "";
    }
}

} // namespace crypto
