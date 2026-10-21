package com.selah.scripturememory;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashSet;
import java.util.Set;

/** Checks a downloaded APK against the checksums and size the server advertised. */
final class UpdateVerifier {
    static final class Result {
        final boolean ok;
        final String reason;
        Result(boolean ok, String reason) { this.ok = ok; this.reason = reason; }
    }

    private UpdateVerifier() {}

    private static String clean(String value) {
        if (value == null) return null;
        String trimmed = value.trim().toLowerCase();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * The download must match the checksum from the X-Sha256 header, the one listed in the release,
     * and the advertised size (when known). At least one checksum is required.
     */
    static Result verify(File file, String headerSha, String releaseSha, long expectedSize) throws IOException {
        Set<String> expected = new HashSet<>();
        if (clean(headerSha) != null) expected.add(clean(headerSha));
        if (clean(releaseSha) != null) expected.add(clean(releaseSha));
        if (expected.isEmpty()) return new Result(false, "The server did not provide a checksum, so the download was refused.");
        if (expected.size() > 1) return new Result(false, "The checksums from the server disagree.");
        if (expectedSize > 0 && file.length() != expectedSize) return new Result(false, "The download is the wrong size.");
        return sha256Hex(file).equals(expected.iterator().next())
            ? new Result(true, "")
            : new Result(false, "The download failed its checksum.");
    }

    /** Updates may only come from our own backend, over https, from the download endpoint. */
    static boolean isAllowedUrl(String address, String host) {
        try {
            java.net.URI uri = new java.net.URI(address);
            return "https".equals(uri.getScheme()) && host.equalsIgnoreCase(uri.getHost()) && uri.getPort() == -1
                && "/api/app/download".equals(uri.getPath()) && uri.getUserInfo() == null;
        } catch (java.net.URISyntaxException e) {
            return false;
        }
    }

    static String sha256Hex(File file) throws IOException {
        try (InputStream input = new FileInputStream(file)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) >= 0) digest.update(buffer, 0, read);
            StringBuilder hex = new StringBuilder();
            for (byte b : digest.digest()) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IOException(e);
        }
    }
}
