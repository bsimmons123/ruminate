package com.selah.scripturememory;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class UpdateVerifierTest {
    @Rule public TemporaryFolder folder = new TemporaryFolder();

    // sha256("hello")
    private static final String HELLO = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

    private File file(String content) throws IOException {
        File file = folder.newFile();
        Files.write(file.toPath(), content.getBytes(StandardCharsets.UTF_8));
        return file;
    }

    @Test public void sha256HexMatchesKnownDigest() throws Exception {
        assertEquals(HELLO, UpdateVerifier.sha256Hex(file("hello")));
    }

    @Test public void matchingChecksumsAndSizePass() throws Exception {
        assertTrue(UpdateVerifier.verify(file("hello"), HELLO, HELLO, 5).ok);
    }

    @Test public void oneChecksumIsEnough() throws Exception {
        assertTrue(UpdateVerifier.verify(file("hello"), null, HELLO, 5).ok);
        assertTrue(UpdateVerifier.verify(file("hello"), HELLO, null, 5).ok);
    }

    @Test public void noChecksumIsRefused() throws Exception {
        UpdateVerifier.Result result = UpdateVerifier.verify(file("hello"), null, " ", 5);
        assertFalse(result.ok);
        assertTrue(result.reason.contains("did not provide a checksum"));
    }

    @Test public void disagreeingChecksumsAreRefused() throws Exception {
        assertFalse(UpdateVerifier.verify(file("hello"), HELLO, "00" + HELLO.substring(2), 5).ok);
    }

    @Test public void wrongSizeIsRefused() throws Exception {
        assertFalse(UpdateVerifier.verify(file("hello"), HELLO, HELLO, 6).ok);
    }

    @Test public void unknownSizeIsNotChecked() throws Exception {
        assertTrue(UpdateVerifier.verify(file("hello"), HELLO, HELLO, 0).ok);
    }

    @Test public void wrongContentIsRefused() throws Exception {
        assertFalse(UpdateVerifier.verify(file("hellp"), HELLO, HELLO, 5).ok);
    }

    @Test public void checksumsCompareCaseInsensitivelyAndTrimmed() throws Exception {
        assertTrue(UpdateVerifier.verify(file("hello"), "  " + HELLO.toUpperCase() + "\n", HELLO, 5).ok);
    }

    @Test public void onlyOurOwnHttpsDownloadEndpointIsAllowed() {
        String host = "ruminate.bible";
        assertTrue(UpdateVerifier.isAllowedUrl("https://ruminate.bible/api/app/download", host));
        assertFalse(UpdateVerifier.isAllowedUrl("http://ruminate.bible/api/app/download", host));
        assertFalse(UpdateVerifier.isAllowedUrl("https://evil.example/api/app/download", host));
        assertFalse(UpdateVerifier.isAllowedUrl("https://ruminate.bible.evil.example/api/app/download", host));
        assertFalse(UpdateVerifier.isAllowedUrl("https://user@ruminate.bible/api/app/download", host));
        assertFalse(UpdateVerifier.isAllowedUrl("https://ruminate.bible/other", host));
        assertFalse(UpdateVerifier.isAllowedUrl("not a url", host));
    }
}
